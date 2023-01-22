/**
  * Compare dereferrer path defined in regex with current path
  * @param {string} derefPath - Regex string of dereferrer
  * @param {string} path - Path to be compared with
  * @param {boolean} onlyBeginning - True if regex should only match at the beginning
  * @return {number} Position where the match ends in the path or -1
  */
function compareRegexPath(derefPath, path, onlyBeginning) {
  if (onlyBeginning) {
    const match = (new RegExp('^' + derefPath)).exec(path);
    return match ? match[0].length : -1;
  }
  const match = (new RegExp('^' + derefPath + '$')).exec(path);
  return match ? match[0].length : -1;
}

/**
  * Compare dereferrer path string with current path
  * @param {string} derefPath - Dereferrer
  * @param {string} path - Path to be compared with
  * @param {boolean} onlyBeginning - True if regex should only match at the beginning
  * @return {number} Position where the match ends in the path or -1
  */
function compareStringPath(derefPath, path, onlyBeginning) {
  if (onlyBeginning) {
    return path.startsWith(derefPath) ? derefPath.length : -1;
  }
  return derefPath === path ? derefPath.length : -1;
}

/**
  * Check for dereferrer and extract included url
  * @param {Object} urlObj - Details about url
  * @param {string} path - Path of the url (part before ? in url)
  * @param {string} query - Query of the url (part between ? and # in url)
  * @param {Object} dereferrer - Dereferrer
  * @param {string} dereferrer.path - Dereferrer path defined as string or regex (/.../)
  * @param {boolean|string[]} dereferrer.param - True if the included url is defined in parameters 
  * @return {string|boolean} Extracted url or false
  */
export function getDerefUrl({ path, query }, dereferrer) {
  let tailIndex;
  if (dereferrer.path.startsWith('/') && dereferrer.path.endsWith('/')) {
    // If dereferrer path defined as regex
    tailIndex = compareRegexPath(dereferrer.path.slice(1,-1), path, !dereferrer.param);
  }
  else {
    tailIndex = compareStringPath(dereferrer.path, path, !dereferrer.param);
  }
  if (tailIndex > -1) {
    // If dereferrer path matches
    if (dereferrer.param) {
      if (dereferrer.param === true) {
        return query;
      }
      const params = new URLSearchParams(query);
      // Loop through params that can include the url
      for (const paramName of dereferrer.param) {
        if (params.has(paramName)) {
          return params.get(paramName);
        }
      }
    }
    if (!dereferrer.param) {
      return path.substring(tailIndex + 1);
    }
  }
  return false;
}