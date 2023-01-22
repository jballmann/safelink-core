export default class Preferences {
  
  constructor(storage) {
    this._storage = storage;
  }
  
  /**
    * Add domain to trustUnknown preferences
    * @param {string} domain - Domain to add
    * @return {Promise<void>}
    */
  async trustUnknown(domain) {
    const custom = await this._storage.get('settings/custom');
    try {
      await this._storage.set('settings/custom',
        {
          ...custom,
          [domain]: true
        }
      );
    }
    catch (err) {
      console.log(err);
    }
  }

  /**
    * Get all prevented domains
    * @return Promise<Object>
    */
  async getPrevention() {
    const prevention = await this._storage.get('settings/prevention');
    return { ...prevention };
  }

  /**
    * Set prevention cache
    * @param {Object} prevention
    */
  async setPrevention(prevention) {
    await this._storage.set('settings/prevention', prevention);
  }
}