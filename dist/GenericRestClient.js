"use strict";
/**
 * GenericRestClient.ts
 * Author: David de Regt
 * Copyright: Microsoft 2015
 *
 * Base client type for accessing RESTful services
 */
Object.defineProperty(exports, "__esModule", { value: true });
var lodashMini_1 = require("./lodashMini");
var SimpleWebRequest_1 = require("./SimpleWebRequest");
var GenericRestClient = /** @class */ (function () {
    function GenericRestClient(endpointUrl) {
        this._defaultOptions = {
            excludeEndpointUrl: false,
            withCredentials: false,
            retries: 0
        };
        this._endpointUrl = endpointUrl;
    }
    GenericRestClient.prototype._performApiCall = function (apiPath, action, objToPost, givenOptions) {
        var _this = this;
        var options = lodashMini_1.defaults({}, givenOptions || {}, this._defaultOptions);
        if (objToPost) {
            options.sendData = objToPost;
        }
        if (options.eTag) {
            if (!options.augmentHeaders) {
                options.augmentHeaders = {};
            }
            options.augmentHeaders['If-None-Match'] = options.eTag;
        }
        if (!options.contentType) {
            options.contentType = lodashMini_1.isString(options.sendData) ? 'form' : 'json';
        }
        var finalUrl = options.excludeEndpointUrl ? apiPath : this._endpointUrl + apiPath;
        return new SimpleWebRequest_1.SimpleWebRequest(action, finalUrl, options, function () { return _this._getHeaders(options); }, function () { return _this._blockRequestUntil(options); })
            .start()
            .then(function (response) {
            _this._processSuccessResponse(response);
            return response;
        });
    };
    GenericRestClient.prototype._getHeaders = function (options) {
        // Virtual function -- No-op by default
        return {};
    };
    // Override (but make sure to call super and chain appropriately) this function if you want to add more blocking criteria.
    // Also, this might be called multiple times to check if the conditions changed
    GenericRestClient.prototype._blockRequestUntil = function (options) {
        // No-op by default
        return undefined;
    };
    // Override this function to process any generic headers that come down with a successful response
    GenericRestClient.prototype._processSuccessResponse = function (resp) {
        // No-op by default
    };
    GenericRestClient.prototype.performApiGet = function (apiPath, options) {
        return this
            .performApiGetDetailed(apiPath, options)
            .then(function (resp) { return resp.body; });
    };
    GenericRestClient.prototype.performApiGetDetailed = function (apiPath, options) {
        return this._performApiCall(apiPath, 'GET', undefined, options);
    };
    GenericRestClient.prototype.performApiPost = function (apiPath, objToPost, options) {
        return this
            .performApiPostDetailed(apiPath, objToPost, options)
            .then(function (resp) { return resp.body; });
    };
    GenericRestClient.prototype.performApiPostDetailed = function (apiPath, objToPost, options) {
        return this._performApiCall(apiPath, 'POST', objToPost, options);
    };
    GenericRestClient.prototype.performApiPatch = function (apiPath, objToPatch, options) {
        return this
            .performApiPatchDetailed(apiPath, objToPatch, options)
            .then(function (resp) { return resp.body; });
    };
    GenericRestClient.prototype.performApiPatchDetailed = function (apiPath, objToPatch, options) {
        return this._performApiCall(apiPath, 'PATCH', objToPatch, options);
    };
    GenericRestClient.prototype.performApiPut = function (apiPath, objToPut, options) {
        return this
            .performApiPutDetailed(apiPath, objToPut, options)
            .then(function (resp) { return resp.body; });
    };
    GenericRestClient.prototype.performApiPutDetailed = function (apiPath, objToPut, options) {
        return this._performApiCall(apiPath, 'PUT', objToPut, options);
    };
    GenericRestClient.prototype.performApiDelete = function (apiPath, objToDelete, options) {
        return this
            .performApiDeleteDetailed(apiPath, objToDelete, options)
            .then(function (resp) { return resp.body; });
    };
    GenericRestClient.prototype.performApiDeleteDetailed = function (apiPath, objToDelete, options) {
        return this._performApiCall(apiPath, 'DELETE', objToDelete, options);
    };
    return GenericRestClient;
}());
exports.GenericRestClient = GenericRestClient;
