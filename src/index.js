/*eslint-enable*/

import { Request } from '@cliqz/adblocker';
import { findBestMatch } from 'string-similarity';

import Register from './register.js';
import Preferences from './preferences.js';
import Updater from './updater.js';
import { getDerefUrl } from './dereferrer.js';
import { removeProtocol, splitupUrl } from './url.js';

export default class SafelinkCore {
  
  /**
    * @param {Object} options - Connector for storage and fetching
    * @param {Object} options.storage - Storage connector
    * @param {Function} options.storage.get
    * @param {Function} options.storage.set
    * @param {Function} options.storage.remove
    * @param {Function} options.fetch
    */
  constructor({ storage, fetch }) {
    this._storage = storage;
    this._fetch = fetch;
    this.prefer = new Preferences(this._storage);
    this.updater = new Updater(this._storage, this._fetch);
  }
  
  /**
    * Fetch all resources and create register afterwards
    * @return Promise<void>
    */
  async create() {
    const lastUpdate = await this._storage.get('timestamp/lastUpdate');
    // Update at most once a day
    if (
      !lastUpdate ||
      JSON.stringify(lastUpdate) === '{}' ||
      (new Date(lastUpdate)).getTime() + 86400000 <= Date.now()
    ) {
      await this.updater.updateMyLists();
      const settings = await this._storage.get('settings/general');
      if (settings.automaticUpdates) {
        await this.updater.updateLists();
      }
      this._storage.set('timestamp/lastUpdate', new Date());
    }
    this.register = new Register(this.updater);
    await this.register.rebuild();
  }

  /**
    * Find information about an url in the register
    * @param {string} urlString - Url to process
    */
  async findDomain(urlString) {
    const request = Request.fromRawDetails({
      url: urlString,
    });
    
    const [sld, ...tld] = request.domain.split('.');
    const domainInfo = {
      domain: request.domain,
      secondLevelDomain: sld,
      topLevelDomain: tld.join('.')
    };
    
    // 1. Check for userdefined in cache
    const custom = await this._storage.get('settings/custom');
    if (custom && custom[request.domain]) {
      return {
        type: 'custom',
        ...domainInfo
      };
    }
    
    const index = this.register.get();
    
    // 2. Look up in register for trusted hosts
    const trusted = index.trusted.domains;
    
    if (trusted[request.domain]) {
      const trustedOrgId = trusted[request.domain];
      const orgDetails = index.trusted.orgs[trustedOrgId] || {};
      return {
        type: 'trusted',
        ...domainInfo,
        ...orgDetails
      };
    }
    
    // 3. Look up in register for redirect hosts
    const isRedirect = index.redirect.redirects.indexOf(request.domain) > -1;
    if (isRedirect) {
      return {
        type: 'redirect',
        ...domainInfo
      };
    }
    
    // 4. Look up in dereferrers
    const { path, query } = splitupUrl(urlString);
    // Loop through dereferrers
    for (const dereferrer of index.redirect.dereferrers) {
      let derefUrl = getDerefUrl({ path, query }, dereferrer);
      if (derefUrl) {
        // If path matches dereferrer
        if (/^[a-zA-Z0-9+/]+(={,2})?$/.test(derefUrl) && dereferrer.format?.includes('base64')) {
          // If derefUrl is base64 encoded and the dereferrer supports base64
          try {
            derefUrl = atob(derefUrl);
          }
          catch {
            continue;
          }
        }
        return {
          type: 'redirect',
          dereferrerTarget: derefUrl,
          ...domainInfo
        }
      }
    }
    
    // 5. Look up in filter for suspicious urls
    const { match } = index.suspicious.match(request);
    if (match) {
      return {
        type: 'suspicious',
        ...domainInfo
      };
    }
    
    // 6. Calculate similarity with trusted domains
    const { bestMatch } = findBestMatch(domainInfo.domain, Object.keys(trusted));
    
    return {
      type: 'unknown',
      similar: bestMatch,
      ...domainInfo
    };
  }
  
  /**
  * Fetch url to find out which location the redirection targets
  * @param {string} url - Url of the redirection service
  * @return Promise<Object> Object that contains the target url and corresponding information
  */
  async findRedirectDomain(url) {
    let response;
    try {
      response = await this._fetch(url, 'follow');
    }
    catch (err) {
      return;
    }
    if (removeProtocol(response.url) === removeProtocol(url)) {
      if (response.status === 404) {
        return { notFound: true };
      }
      return { invalid: true };
    }
    if (!response.redirected) {
      return { invalid: true };
    }
    
    const responseUrl = response.url;
    return { url: responseUrl, ...(await this.findDomain(responseUrl)) };
  }
  
}