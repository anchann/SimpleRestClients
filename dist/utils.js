"use strict";
/**
 * utils.ts
 * Copyright: Microsoft 2019
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assert = function (cond, message) {
    if (!cond) {
        throw new Error(message);
    }
};
