const DEFAULT_URL = 'https://raw.githubusercontent.com/jballmann/safelink-lists/main/lists/default_lists.json';

export default class Updater {
  
  constructor(storage, fetch) {
    this._storage = storage;
    this._fetch = fetch;
  }
  
  /**
    * Update cache for myLists
    * @return {Promise<void>}
    */
  async updateMyLists() {
    const myLists = (await this._storage.get('settings/lists')) || {};
    const defaultVersion = await this._storage.get('timestamp/default');
    
    let body;
    try {
      const response = await this._fetch(DEFAULT_URL);
      body = await response.json();
    }
    catch (err) {
      // assets fetching failed
      console.log(err);
      return;
    }
    
    // check version
    if (!body || (defaultVersion && new Date(body.version) <= new Date(defaultVersion))) {
      return;
    }
    
    this._storage.set('timestamp/default', body.version);
    
    // Delete all for deletion recommend entries
    for (const deleteId of body.data.delete) {
      delete myLists[deleteId];
      this._storage.remove('cached/' + deleteId);
    }
    
    // Add default lists to myLists
    for (const listId in body.data.list) {
      const listDetails = body.data.list[listId];
      
      let off;
      if (myLists[listId]) {
        // Keep user preference of activation
        off = myLists[listId].off;
      }
      else {
        // Otherwise use recommendation of list
        off = listDetails.off || false;
      }
      
      myLists[listId] = {
        ...myLists[listId],
        ...listDetails,
        off
      };
    }
    await this._storage.set('settings/lists', myLists);
  }

  /**
    * Get metadata from JSON object
    * @private
    * @param {Object} data
    * @return {Object} Meta data
    * @property {string} title
    * @property {string} web
    */
  _getMetadataFromJson(data) {
    const metadata = {};
    if (data.title) {
      metadata.title = data.title;
    }
    if (data.website) {
      metadata.web = data.website;
    }
    return metadata;
  }

  /**
    * Get metadata from Text file string
    * @private
    * @param {string} data - Text file string
    * @return {Object} Meta data
    * @property {string} title
    * @property {string} web
    */
  _getMetadataFromTxt(data) {
    const metadata = {};
    const matchTitle = data.match(/^[!#]\sTitle:\s(.*)$/m);
    if (matchTitle) {
      metadata.title = matchTitle[1];
    }
    const matchWeb = data.match(/^[!#]\s(Homepage|Website):\s(.*)$/m);
    if (matchWeb) {
      metadata.web = matchWeb[2];
    }
    return metadata;
  }

  /**
    * Update cache for all lists in myLists, unless a single list is passed
    * @param {string} [singleList] - Id of the list that should be updated
    * @return {Promise<void>}
    */
  async updateLists(singleList) {
    const myLists = await this._storage.get('settings/lists');
    
    /**
      * Updates single list
      * Inline function to adjust myLists with list meta data
      * @param {string} listId - List which should be updated
      * @param {Object} details
      * @param {string} details.url - Url where to fetch from
      * @param {string} details.type - Type of the list
      * @return {Promise<void>}
      */
    const _update = async (listId, { url, type }) => {
      const cached = await this._storage.get('cached/' + listId);
      let body;
      try {
        const response = await this._fetch(url);
        if (type === 'trusted' || type === 'redirect') {
          // If in JSON format
          body = await response.json();
          if (cached && new Date(cached.version) >= new Date(body.version)) {
            // Is already up to date
            return;
          }
          
          // Adopt title and website of list in myLists
          myLists[listId] = {
            ...myLists[listId],
            ...this._getMetadataFromJson(body)
          }
          
          await this._storage.set('cached/' + listId, body);
        }
        else if (type === 'suspicious') {
          // If in TXT format
          body = await response.text();
          // Adopt title and website of list in myLists
          myLists[listId] = {
            ...myLists[listId],
            ...this._getMetadataFromTxt(body)
          }
          
          await this._storage.set('cached/' + listId, body);
        }
      }
      catch (err) { console.log(err); }
    }
    
    if (singleList) {
      // If single list is specified
      await _update(singleList, myLists[singleList]);
    }
    else {
      // Otherwise update all lists in myLists that are activated
      const promises = [];
      for (const listId in myLists) {
        const { off, url, type } = myLists[listId];
        if (!off) {
          promises.push(_update(listId, { url, type }));
        }
      }
      await Promise.allSettled(promises);
    }
    this._storage.set('settings/lists', myLists);
  }

  /**
    * Add an userdefined list to myLists and cache
    * @param {string} url - Url where to fetch list from
    * @return {Promise<void>}
    */
  async addList(url) {
    const myLists = await this._storage.get('settings/lists');
    
    try {
      const response = await this._fetch(url);
      const body = await response.text();
      try {
        // While JSON.parse throws no error the body is in JSON format
        const json = JSON.parse(body);
        // Is in JSON format
        const id = json.id || url;
        myLists[id] = {
          url,
          type: json.type,
          group: 'custom',
          off: false,
          ...this._getMetadataFromJson(json)
        }
        
        await this._storage.set('cached/' + id, json);
      }
      catch {
        // JSON.parse throws error
        myLists[url] = {
          url,
          type: 'suspicious',
          group: 'custom',
          off: false,
          ...this._getMetadataFromTxt(body)
        }
        await this._storage.set('cached/' + url, body);
      }
      this._storage.set('settings/lists', myLists);
    }
    catch (err) {
      console.log(err);
    }
  }
}