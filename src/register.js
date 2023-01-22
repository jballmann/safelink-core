import { FiltersEngine } from '@cliqz/adblocker';

export default class Register {
  
  constructor(updater) {
    this._updater = updater;
    this.index = {};
  }
  
  get() {
    return this.index;
  }
  
  /**
    * Update index by processing all lists in myLists
    * @return {Promise<void>}
    */
  async rebuild() {
    const myLists = await this._updater._storage.get('settings/lists');
    // Reset index to template
    this.index = JSON.parse(JSON.stringify({
      trusted: {
        orgs: {},
        domains: {}
      },
      redirect: {
        dereferrers: [],
        redirects: []
      },
      suspicious: null
    }));
    
    // Allocate all lists to matching type
    let listsByCategory = {
      trusted: [],
      redirect: [],
      suspicious: []
    };
    const missingUpdates = [];
    for (const listId in myLists) {
      const { off, type } = myLists[listId];
      if (!off) {
        const cached = await this._updater._storage.get('cached/' + listId);
        if (!cached) {
          missingUpdates.push(this._updater.updateLists(listId))
        }
        listsByCategory[type].push(listId);
      }
    }
    // fetch all not cached lists
    if (missingUpdates.length > 0) {
      await Promise.allSettled(missingUpdates);
    }
    // Process all types separately
    await Promise.all([
      this._buildTrusted(listsByCategory.trusted),
      this._buildRedirect(listsByCategory.redirect),
      this._buildSuspicious(listsByCategory.suspicious)
    ]);
  }
  
  /**
    * Index trusted organisations and domains
    * @private
    * @param {string[]} lists - Array of trusted list ids
    * @return {Promise<void>}
    */
  async _buildTrusted(lists) {
    let external = {};
    const promises = [];
    for (const listId of lists) {
      promises.push((async () => {
        const cached = await this._updater._storage.get('cached/' + listId);
        if (cached?.data) {
          const data = cached.data;
          this.index.trusted.orgs = {
            ...this.index.trusted.orgs,
            ...(data.orgs || {})
          };
          this.index.trusted.domains = {
            ...this.index.trusted.domains,
            ...(data.domains || {})
          };
          // check for external dependencies and add them to the external object
          if (data.external) {
            for (const externalId in data.external) {
              if (!external[externalId]) {
                const { url, ids } = data.external[externalId];
                external[externalId] = {url, ids};
              }
              else {
                external[externalId].ids.concat(data.external[externalId].ids);
              }
            }
          }
        }
      })());
    }
    await Promise.allSettled(promises);
    this._addExternals(external, Object.keys(lists));
  }

  /**
    * Index redirects and dereferrers
    * @private
    * @param {string[]} lists - Array of redirect list ids
    * @return {Promise<void>}
    */
  async _buildRedirect(lists) {
    const promises = [];
    for (const listId of lists) {
      promises.push((async () => {
        const cached = await this._updater._storage.get('cached/' + listId);
        if (cached?.data) {
          const data = cached.data;
          this.index.redirect.redirects = [
            ...this.index.redirect.redirects,
            ...(data.redirects || {})
          ];
          this.index.redirect.dereferrers = [
            ...this.index.redirect.dereferrers,
            ...(data.dereferrers || {})
          ];
        }
      })());
    }
    await Promise.allSettled(promises);
  }

  /**
    * Creates adblock filter for suspicious lists
    * @private
    * @param {string[]} lists - Array of suspicious list ids
    * @return {Promise<void>}
    */
  async _buildSuspicious(lists) {
    let promises = [];
    for (const listId of lists) {
      promises.push((async () => {
        return await this._updater._storage.get('cached/' + listId);
      })());
    }
    const promiseResults = await Promise.allSettled(promises);
    const filterList = [];
    for (const result of promiseResults) {
      if (result.status === 'fulfilled') {
        filterList.push(result.value);
      }
    }
    this.index.suspicious = await FiltersEngine.parse(filterList.join('\n'));
  }

  /**
    * Index required externals that are needed by trusted lists
    * @private
    * @param {Object} external - Object of externals
    * @param {string} external[].url - Url where to fetch the external list
    * @param {string[]} external[].ids - Ids of the organization that should be indexed
    * @param {string[]} existingIds - Array of already processed lists
    * @return {Promise<void>}
    */
  async _addExternals(external, existingIds) {
    const promises = [];
    for (const externalId in external) {
      // If trusted list is fully processed before skip indexing of list
      if (existingIds.indexOf(externalId) > -1) {
        continue;
      }
      let { url, ids } = external[externalId];
      ids = [...new Set(ids)];
        
      promises.push((async () => {
        const cached = await this._updater._storage.get('cached/' + externalId);
       
        let orgs;
        try {
          const response = await this._updater._fetch(url);
          const body = await response.json();
          if (!cached && new Date(cached.version) < new Date(body.version)) {   
            orgs = body.data.orgs;
            // store only all organizations listed in list
            await this._updater._storage.set('cached/' + externalId,
              { version: body.version, data: { orgs } }
            )
          }
        }
        catch (err) { console.log(err); }
        
        if (!orgs) {
          orgs = cached.data.orgs;
        }
        
        // Index only organizations listed in ids
        const specificOrgs = {};
        for (const orgId of ids) {
          specificOrgs[orgId] = orgs[orgId];
        }
        
        this.index.trusted.orgs = {
          ...this.index.trusted.orgs,
          ...specificOrgs
        };
      })());
    }
    await Promise.allSettled(promises);
  }
}