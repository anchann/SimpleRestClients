/**
 * lodashMini.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Imports a subset of lodash library needed for ReactXP's implementation.
 */

import defaults = require('lodash/defaults');
import remove = require('lodash/remove');
import attempt = require('lodash/attempt');
import isString = require('lodash/isString');
import isObject = require('lodash/isObject');
import extend = require('lodash/extend');
import includes = require('lodash/includes');
import findIndex = require('lodash/findIndex');
import cloneDeep = require('lodash/cloneDeep');
import map = require('lodash/map');

export interface Dictionary<T> {
    [index: string]: T;
}

export {
    defaults,
    remove,
    attempt,
    isString,
    isObject,
    extend,
    includes,
    findIndex,
    cloneDeep,
    map
};
