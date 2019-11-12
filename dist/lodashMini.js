"use strict";
/**
 * lodashMini.ts
 *
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT license.
 *
 * Imports a subset of lodash library needed for ReactXP's implementation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var defaults = require("lodash/defaults");
exports.defaults = defaults;
var remove = require("lodash/remove");
exports.remove = remove;
var attempt = require("lodash/attempt");
exports.attempt = attempt;
var isString = require("lodash/isString");
exports.isString = isString;
var isObject = require("lodash/isObject");
exports.isObject = isObject;
var extend = require("lodash/extend");
exports.extend = extend;
var includes = require("lodash/includes");
exports.includes = includes;
var findIndex = require("lodash/findIndex");
exports.findIndex = findIndex;
var cloneDeep = require("lodash/cloneDeep");
exports.cloneDeep = cloneDeep;
var map = require("lodash/map");
exports.map = map;
