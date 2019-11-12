"use strict";
/**
 * SimpleWebRequest.ts
 * Author: David de Regt
 * Copyright: Microsoft 2016
 *
 * Simple client for issuing web requests.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var _ = require("./lodashMini");
var SyncTasks = require("synctasks");
var utils_1 = require("./utils");
var ExponentialTime_1 = require("./ExponentialTime");
var WebRequestPriority;
(function (WebRequestPriority) {
    WebRequestPriority[WebRequestPriority["DontCare"] = 0] = "DontCare";
    WebRequestPriority[WebRequestPriority["Low"] = 1] = "Low";
    WebRequestPriority[WebRequestPriority["Normal"] = 2] = "Normal";
    WebRequestPriority[WebRequestPriority["High"] = 3] = "High";
    WebRequestPriority[WebRequestPriority["Critical"] = 4] = "Critical";
})(WebRequestPriority = exports.WebRequestPriority || (exports.WebRequestPriority = {}));
var ErrorHandlingType;
(function (ErrorHandlingType) {
    // Ignore retry policy, if any, and fail immediately
    ErrorHandlingType[ErrorHandlingType["DoNotRetry"] = 0] = "DoNotRetry";
    // Retry immediately, without counting it as a failure (used when you've made some sort of change to the )
    ErrorHandlingType[ErrorHandlingType["RetryUncountedImmediately"] = 1] = "RetryUncountedImmediately";
    // Retry with exponential backoff, but don't count it as a failure (for 429 handling)
    ErrorHandlingType[ErrorHandlingType["RetryUncountedWithBackoff"] = 2] = "RetryUncountedWithBackoff";
    // Use standard retry policy (count it as a failure, exponential backoff as policy dictates)
    ErrorHandlingType[ErrorHandlingType["RetryCountedWithBackoff"] = 3] = "RetryCountedWithBackoff";
    // Return this if you need to satisfy some condition before this request will retry (then call .resumeRetrying()).
    ErrorHandlingType[ErrorHandlingType["PauseUntilResumed"] = 4] = "PauseUntilResumed";
})(ErrorHandlingType = exports.ErrorHandlingType || (exports.ErrorHandlingType = {}));
function isJsonContentType(ct) {
    return !!ct && ct.indexOf('application/json') === 0;
}
function isFormContentType(ct) {
    return !!ct && ct.indexOf('application/x-www-form-urlencoded') === 0;
}
function isFormDataContentType(ct) {
    return !!ct && ct.indexOf('multipart/form-data') === 0;
}
exports.DefaultOptions = {
    priority: WebRequestPriority.Normal
};
exports.SimpleWebRequestOptions = {
    MaxSimultaneousRequests: 5,
    HungRequestCleanupIntervalMs: 10000,
    setTimeout: function (callback, timeoutMs) { return window.setTimeout(callback, timeoutMs); },
    clearTimeout: function (id) { return window.clearTimeout(id); }
};
function DefaultErrorHandler(webRequest, errResp) {
    if (errResp.canceled || !errResp.statusCode || errResp.statusCode >= 400 && errResp.statusCode < 600) {
        // Fail canceled/0/4xx/5xx requests immediately.
        // These are permenent failures, and shouldn't have retry logic applied to them.
        return ErrorHandlingType.DoNotRetry;
    }
    // Possible transient failure -- just retry as normal with backoff.
    return ErrorHandlingType.RetryCountedWithBackoff;
}
exports.DefaultErrorHandler = DefaultErrorHandler;
// List of pending requests, sorted from most important to least important (numerically descending)
var requestQueue = [];
// List of requests blocked on _blockUNtil promises
var blockedList = [];
// List of executing (non-finished) requests -- only to keep track of number of requests to compare to the max
var executingList = [];
var hungRequestCleanupTimer;
// Feature flag checkers for whether the current environment supports various types of XMLHttpRequest features
var onLoadErrorSupportStatus = 0 /* Unknown */;
var timeoutSupportStatus = 0 /* Unknown */;
var SimpleWebRequestBase = /** @class */ (function () {
    function SimpleWebRequestBase(_action, _url, options, _getHeaders, _blockRequestUntil) {
        this._action = _action;
        this._url = _url;
        this._getHeaders = _getHeaders;
        this._blockRequestUntil = _blockRequestUntil;
        this._aborted = false;
        this._timedOut = false;
        this._paused = false;
        this._created = Date.now();
        // De-dupe result handling for two reasons so far:
        // 1. Various platforms have bugs where they double-resolves aborted xmlhttprequests
        // 2. Safari seems to have a bug where sometimes it double-resolves happily-completed xmlhttprequests
        this._finishHandled = false;
        this._retryExponentialTime = new ExponentialTime_1.ExponentialTime(1000, 300000);
        this._options = _.defaults(options, exports.DefaultOptions);
    }
    SimpleWebRequestBase.prototype.getPriority = function () {
        return this._options.priority || WebRequestPriority.DontCare;
    };
    SimpleWebRequestBase.checkQueueProcessing = function () {
        var _loop_1 = function () {
            var req = requestQueue.shift();
            blockedList.push(req);
            var blockPromise = (req._blockRequestUntil && req._blockRequestUntil()) || SyncTasks.Resolved();
            blockPromise.finally(function () {
                _.remove(blockedList, req);
            }).then(function () {
                if (executingList.length < exports.SimpleWebRequestOptions.MaxSimultaneousRequests && !req._aborted) {
                    executingList.push(req);
                    SimpleWebRequest._scheduleHungRequestCleanupIfNeeded();
                    req._fire();
                }
                else {
                    req._enqueue();
                }
            }, function (err) {
                // fail the request if the block promise is rejected
                req._respond('_blockRequestUntil rejected: ' + err);
            });
        };
        while (requestQueue.length > 0 && executingList.length < exports.SimpleWebRequestOptions.MaxSimultaneousRequests) {
            _loop_1();
        }
    };
    SimpleWebRequestBase._scheduleHungRequestCleanupIfNeeded = function () {
        // Schedule a cleanup timer if needed
        if (executingList.length > 0 && hungRequestCleanupTimer === undefined) {
            hungRequestCleanupTimer = exports.SimpleWebRequestOptions.setTimeout(this._hungRequestCleanupTimerCallback, exports.SimpleWebRequestOptions.HungRequestCleanupIntervalMs);
        }
        else if (executingList.length === 0 && hungRequestCleanupTimer) {
            exports.SimpleWebRequestOptions.clearTimeout(hungRequestCleanupTimer);
            hungRequestCleanupTimer = undefined;
        }
    };
    SimpleWebRequestBase.prototype._removeFromQueue = function () {
        // Only pull from request queue and executing queue here - pulling from the blocked queue can result in requests
        // being queued up multiple times if _respond fires more than once (it shouldn't, but does happen in the wild)
        _.remove(executingList, this);
        _.remove(requestQueue, this);
    };
    SimpleWebRequestBase.prototype._assertAndClean = function (expression, message) {
        if (!expression) {
            this._removeFromQueue();
            console.error(message);
            utils_1.assert(expression, message);
        }
    };
    // TSLint thinks that this function is unused.  Silly tslint.
    // tslint:disable-next-line
    SimpleWebRequestBase.prototype._fire = function () {
        var _this = this;
        this._xhr = new XMLHttpRequest();
        this._xhrRequestHeaders = {};
        // xhr.open() can throw an exception for a CSP violation.
        var openError = _.attempt(function () {
            // Apparently you're supposed to open the connection before adding events to it.  If you don't, the node.js implementation
            // of XHR actually calls this.abort() at the start of open()...  Bad implementations, hooray.
            _this._xhr.open(_this._action, _this._url, true);
        });
        if (openError) {
            this._respond(openError.toString());
            return;
        }
        if (this._options.timeout) {
            var timeoutSupported_1 = timeoutSupportStatus;
            // Use manual timer if we don't know about timeout support
            if (timeoutSupported_1 !== 3 /* Supported */) {
                this._assertAndClean(!this._requestTimeoutTimer, 'Double-fired requestTimeoutTimer');
                this._requestTimeoutTimer = exports.SimpleWebRequestOptions.setTimeout(function () {
                    _this._requestTimeoutTimer = undefined;
                    _this._timedOut = true;
                    _this.abort();
                }, this._options.timeout);
            }
            // This is our first completed request. Use it for feature detection
            if (timeoutSupported_1 === 3 /* Supported */ || timeoutSupported_1 <= 1 /* Detecting */) {
                // timeout and ontimeout are part of the XMLHttpRequest Level 2 spec, should be supported in most modern browsers
                this._xhr.timeout = this._options.timeout;
                this._xhr.ontimeout = function () {
                    timeoutSupportStatus = 3 /* Supported */;
                    if (timeoutSupported_1 !== 3 /* Supported */) {
                        // When this request initially fired we didn't know about support, bail & let the fallback method handle this
                        return;
                    }
                    _this._timedOut = true;
                    // Set aborted flag to match simple timer approach, which aborts the request and results in an _respond call
                    _this._aborted = true;
                    _this._respond('TimedOut');
                };
            }
        }
        var onLoadErrorSupported = onLoadErrorSupportStatus;
        // Use onreadystatechange if we don't know about onload support or it onload is not supported
        if (onLoadErrorSupported !== 3 /* Supported */) {
            if (onLoadErrorSupported === 0 /* Unknown */) {
                // Set global status to detecting, leave local state so we can set a timer on finish
                onLoadErrorSupportStatus = 1 /* Detecting */;
            }
            this._xhr.onreadystatechange = function () {
                if (!_this._xhr) {
                    return;
                }
                if (_this._xhr.readyState === 3 && _this._options.streamingDownloadProgress && !_this._aborted) {
                    // This callback may result in cancelling the connection, so keep that in mind with any handling after it
                    // if we decide to stop using the return after this someday down the line.  i.e. this._xhr may be undefined
                    // when we come back from this call.
                    _this._options.streamingDownloadProgress(_this._xhr.responseText);
                    return;
                }
                if (_this._xhr.readyState !== 4) {
                    // Wait for it to finish
                    return;
                }
                // This is the first request completed (unknown status when fired, detecting now), use it for detection
                if (onLoadErrorSupported === 0 /* Unknown */ &&
                    onLoadErrorSupportStatus === 1 /* Detecting */) {
                    // If onload hasn't fired within 10 seconds of completion, detect as not supported
                    exports.SimpleWebRequestOptions.setTimeout(function () {
                        if (onLoadErrorSupportStatus !== 3 /* Supported */) {
                            onLoadErrorSupportStatus = 2 /* NotSupported */;
                        }
                    }, 10000);
                }
                _this._respond();
            };
        }
        else if (this._options.streamingDownloadProgress) {
            // If we support onload and such, but have a streaming download handler, still trap the oRSC.
            this._xhr.onreadystatechange = function () {
                if (!_this._xhr) {
                    return;
                }
                if (_this._xhr.readyState === 3 && _this._options.streamingDownloadProgress && !_this._aborted) {
                    // This callback may result in cancelling the connection, so keep that in mind with any handling after it
                    // if we decide to stop using the return after this someday down the line.  i.e. this._xhr may be undefined
                    // when we come back from this call.
                    _this._options.streamingDownloadProgress(_this._xhr.responseText);
                }
            };
        }
        if (onLoadErrorSupported !== 2 /* NotSupported */) {
            // onLoad and onError are part of the XMLHttpRequest Level 2 spec, should be supported in most modern browsers
            this._xhr.onload = function () {
                onLoadErrorSupportStatus = 3 /* Supported */;
                if (onLoadErrorSupported !== 3 /* Supported */) {
                    // When this request initially fired we didn't know about support, bail & let the fallback method handle this
                    return;
                }
                _this._respond();
            };
            this._xhr.onerror = function () {
                onLoadErrorSupportStatus = 3 /* Supported */;
                if (onLoadErrorSupported !== 3 /* Supported */) {
                    // When this request initially fired we didn't know about support, bail & let the fallback method handle this
                    return;
                }
                _this._respond();
            };
        }
        this._xhr.onabort = function () {
            // If the browser cancels us (page navigation or whatever), it sometimes calls both the readystatechange and this,
            // so make sure we know that this is an abort.
            _this._aborted = true;
            _this._respond('Aborted');
        };
        if (this._xhr.upload && this._options.onProgress) {
            this._xhr.upload.onprogress = this._options.onProgress;
        }
        var acceptType = this._options.acceptType || 'json';
        var responseType = this._options.customResponseType || SimpleWebRequestBase._getResponseType(acceptType);
        var responseTypeError = _.attempt(function () {
            _this._xhr.responseType = responseType;
        });
        if (responseTypeError) {
            // WebKit added support for the json responseType value on 09/03/2013
            // https://bugs.webkit.org/show_bug.cgi?id=73648.
            // Versions of Safari prior to 7 and Android 4 Samsung borwsers are
            // known to throw an Error when setting the value "json" as the response type.
            //
            // The json response type can be ignored if not supported, because JSON payloads
            // are handled by mapBody anyway
            if (responseType !== 'json') {
                throw responseTypeError;
            }
        }
        SimpleWebRequest._setRequestHeader(this._xhr, this._xhrRequestHeaders, 'Accept', SimpleWebRequestBase.mapContentType(acceptType));
        this._xhr.withCredentials = !!this._options.withCredentials;
        var nextHeaders = this.getRequestHeaders();
        // check/process headers
        var headersCheck = {};
        Object.keys(nextHeaders).forEach(function (key) {
            var value = nextHeaders[key];
            var headerLower = key.toLowerCase();
            if (headerLower === 'content-type') {
                _this._assertAndClean(false, "Don't set Content-Type with options.headers -- use it with the options.contentType property");
                return;
            }
            if (headerLower === 'accept') {
                _this._assertAndClean(false, "Don't set Accept with options.headers -- use it with the options.acceptType property");
                return;
            }
            _this._assertAndClean(!headersCheck[headerLower], "Setting duplicate header key: " + headersCheck[headerLower] + " and " + key);
            if (value === undefined || value === null) {
                console.warn("Tried to set header \"" + key + "\" on request with \"" + value + "\" value, header will be dropped");
                return;
            }
            headersCheck[headerLower] = true;
            SimpleWebRequest._setRequestHeader(_this._xhr, _this._xhrRequestHeaders, key, value);
        });
        // HACKING
        if (this._options.returnRawData) {
            this._xhr.responseType = 'text';
        }
        if (this._options.sendData) {
            var contentType = SimpleWebRequestBase.mapContentType(this._options.contentType || 'json');
            SimpleWebRequest._setRequestHeader(this._xhr, this._xhrRequestHeaders, 'Content-Type', contentType);
            var sendData = SimpleWebRequestBase.mapBody(this._options.sendData, contentType);
            this._xhr.send(sendData);
        }
        else {
            this._xhr.send();
        }
    };
    SimpleWebRequestBase._setRequestHeader = function (xhr, xhrRequestHeaders, key, val) {
        xhr.setRequestHeader(key, val);
        xhrRequestHeaders[key] = val;
    };
    SimpleWebRequestBase.mapContentType = function (contentType) {
        if (contentType === 'json') {
            return 'application/json';
        }
        else if (contentType === 'form') {
            return 'application/x-www-form-urlencoded';
        }
        else {
            return contentType;
        }
    };
    SimpleWebRequestBase.mapBody = function (sendData, contentType) {
        if (isJsonContentType(contentType)) {
            if (!_.isString(sendData)) {
                return JSON.stringify(sendData);
            }
        }
        else if (isFormContentType(contentType)) {
            if (!_.isString(sendData) && _.isObject(sendData)) {
                var params = _.map(sendData, function (val, key) {
                    return encodeURIComponent(key) + (val ? '=' + encodeURIComponent(val.toString()) : '');
                });
                return params.join('&');
            }
        }
        else if (isFormDataContentType(contentType)) {
            if (_.isObject(sendData)) {
                // Note: This only works for IE10 and above.
                var formData_1 = new FormData();
                var params_1 = sendData;
                Object.keys(params_1)
                    .forEach(function (param) { return formData_1.append(param, params_1[param]); });
                return formData_1;
            }
            else {
                utils_1.assert(false, 'contentType multipart/form-data must include an object as sendData');
            }
        }
        return sendData;
    };
    SimpleWebRequestBase.prototype.setUrl = function (newUrl) {
        this._url = newUrl;
    };
    SimpleWebRequestBase.prototype.setHeader = function (key, val) {
        if (!this._options.augmentHeaders) {
            this._options.augmentHeaders = {};
        }
        if (val) {
            this._options.augmentHeaders[key] = val;
        }
        else {
            delete this._options.augmentHeaders[key];
        }
    };
    SimpleWebRequestBase.prototype.getRequestHeaders = function () {
        var headers = {};
        if (this._getHeaders && !this._options.overrideGetHeaders && !this._options.headers) {
            headers = _.extend(headers, this._getHeaders());
        }
        if (this._options.overrideGetHeaders) {
            headers = _.extend(headers, this._options.overrideGetHeaders);
        }
        if (this._options.headers) {
            headers = _.extend(headers, this._options.headers);
        }
        if (this._options.augmentHeaders) {
            headers = _.extend(headers, this._options.augmentHeaders);
        }
        return headers;
    };
    SimpleWebRequestBase.prototype.getOptions = function () {
        return _.cloneDeep(this._options);
    };
    SimpleWebRequestBase.prototype.setPriority = function (newPriority) {
        var _this = this;
        if (this._options.priority === newPriority) {
            return;
        }
        this._options.priority = newPriority;
        if (this._paused) {
            return;
        }
        if (this._xhr) {
            // Already fired -- wait for it to retry for the new priority to matter
            return;
        }
        // Remove and re-queue
        _.remove(requestQueue, function (item) { return item === _this; });
        this._enqueue();
    };
    SimpleWebRequestBase.prototype.resumeRetrying = function () {
        if (!this._paused) {
            utils_1.assert(false, 'resumeRetrying() called but not paused!');
            return;
        }
        this._paused = false;
        this._enqueue();
    };
    SimpleWebRequestBase.prototype._enqueue = function () {
        var _this = this;
        // It's possible for a request to be canceled before it's queued since onCancel fires synchronously and we set up the listener
        // before queueing for execution
        // An aborted request should never be queued for execution
        if (this._aborted) {
            return;
        }
        // Check if the current queues, if the request is already in there, nothing to enqueue
        if (_.includes(executingList, this) || _.includes(blockedList, this) || _.includes(requestQueue, this)) {
            return;
        }
        // Throw it on the queue
        var index = _.findIndex(requestQueue, function (request) {
            // find a request with the same priority, but newer
            return (request.getPriority() === _this.getPriority() && request._created > _this._created) ||
                // or a request with lower priority
                (request.getPriority() < _this.getPriority());
        });
        if (index > -1) {
            //add me before the found request
            requestQueue.splice(index, 0, this);
        }
        else {
            //add me at the end
            requestQueue.push(this);
        }
        // See if it's time to execute it
        SimpleWebRequestBase.checkQueueProcessing();
    };
    SimpleWebRequestBase._getResponseType = function (acceptType) {
        if (acceptType === 'blob') {
            return 'arraybuffer';
        }
        if (acceptType === 'text/xml' || acceptType === 'application/xml') {
            return 'document';
        }
        if (acceptType === 'text/plain') {
            return 'text';
        }
        return 'json';
    };
    SimpleWebRequestBase._hungRequestCleanupTimerCallback = function () {
        hungRequestCleanupTimer = undefined;
        executingList.filter(function (request) {
            if (request._xhr && request._xhr.readyState === 4) {
                console.warn('SimpleWebRequests found a completed XHR that hasn\'t invoked it\'s callback functions, manually responding');
                return true;
            }
            return false;
        }).forEach(function (request) {
            // We need to respond outside of the initial iteration across the array since _respond mutates exeutingList
            request._respond();
        });
        SimpleWebRequest._scheduleHungRequestCleanupIfNeeded();
    };
    return SimpleWebRequestBase;
}());
exports.SimpleWebRequestBase = SimpleWebRequestBase;
var SimpleWebRequest = /** @class */ (function (_super) {
    __extends(SimpleWebRequest, _super);
    function SimpleWebRequest(action, url, options, getHeaders, blockRequestUntil) {
        return _super.call(this, action, url, options, getHeaders, blockRequestUntil) || this;
    }
    SimpleWebRequest.prototype.abort = function () {
        if (this._aborted) {
            utils_1.assert(false, 'Already aborted ' + this._action + ' request to ' + this._url);
            return;
        }
        this._aborted = true;
        if (this._retryTimer) {
            exports.SimpleWebRequestOptions.clearTimeout(this._retryTimer);
            this._retryTimer = undefined;
        }
        if (this._requestTimeoutTimer) {
            exports.SimpleWebRequestOptions.clearTimeout(this._requestTimeoutTimer);
            this._requestTimeoutTimer = undefined;
        }
        if (!this._deferred) {
            utils_1.assert(false, 'Haven\'t even fired start() yet -- can\'t abort');
            return;
        }
        // Cannot rely on this._xhr.abort() to trigger this._xhr.onAbort() synchronously, thus we must trigger an early response here
        this._respond('Aborted');
        if (this._xhr) {
            // Abort the in-flight request
            this._xhr.abort();
        }
    };
    SimpleWebRequest.prototype.start = function () {
        var _this = this;
        if (this._deferred) {
            utils_1.assert(false, 'WebRequest already started');
            return SyncTasks.Rejected('WebRequest already started');
        }
        this._deferred = SyncTasks.Defer();
        this._deferred.onCancel(function () {
            // Abort the XHR -- this should chain through to the fail case on readystatechange
            _this.abort();
        });
        this._enqueue();
        return this._deferred.promise();
    };
    SimpleWebRequest.prototype._respond = function (errorStatusText) {
        var _this = this;
        if (this._finishHandled) {
            // Aborted web requests often double-finish due to odd browser behavior, but non-aborted requests shouldn't...
            // Unfortunately, this assertion fires frequently in the Safari browser, presumably due to a non-standard
            // XHR implementation, so we need to comment it out.
            // This also might get hit during browser feature detection process
            // assert(this._aborted || this._timedOut, 'Double-finished XMLHttpRequest');
            return;
        }
        this._finishHandled = true;
        this._removeFromQueue();
        if (this._retryTimer) {
            exports.SimpleWebRequestOptions.clearTimeout(this._retryTimer);
            this._retryTimer = undefined;
        }
        if (this._requestTimeoutTimer) {
            exports.SimpleWebRequestOptions.clearTimeout(this._requestTimeoutTimer);
            this._requestTimeoutTimer = undefined;
        }
        var statusCode = 0;
        var statusText;
        if (this._xhr) {
            try {
                statusCode = this._xhr.status;
                statusText = this._xhr.statusText || errorStatusText;
            }
            catch (e) {
                // Some browsers error when you try to read status off aborted requests
            }
        }
        else {
            statusText = errorStatusText || 'Browser Error - Possible CORS or Connectivity Issue';
        }
        var headers = {};
        var body;
        // Build the response info
        if (this._xhr) {
            // Parse out headers
            var headerLines = (this._xhr.getAllResponseHeaders() || '').split(/\r?\n/);
            headerLines.forEach(function (line) {
                if (line.length === 0) {
                    return;
                }
                var index = line.indexOf(':');
                if (index === -1) {
                    headers[line] = '';
                }
                else {
                    headers[line.substr(0, index).toLowerCase()] = line.substr(index + 1).trim();
                }
            });
            // Some browsers apparently don't set the content-type header in some error conditions from getAllResponseHeaders but do return
            // it from the normal getResponseHeader.  No clue why, but superagent mentions it as well so it's best to just conform.
            if (!headers['content-type']) {
                var check = this._xhr.getResponseHeader('content-type');
                if (check) {
                    headers['content-type'] = check;
                }
            }
            body = this._xhr.response;
            if (!this._options.returnRawData && headers['content-type'] && isJsonContentType(headers['content-type'])) {
                if (!body || !_.isObject(body)) {
                    // Response can be null if the responseType does not match what the server actually sends
                    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/responseType
                    // Only access responseText if responseType is "text" or "", otherwise it will throw
                    // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/responseText
                    if ((this._xhr.responseType === 'text' || this._xhr.responseType === '') && this._xhr.responseText) {
                        try {
                            body = JSON.parse(this._xhr.responseText);
                        }
                        catch (ex) {
                            // If a service returns invalid JSON in a payload, we can end up here - don't crash
                            console.warn('Failed to parse XHR JSON response');
                        }
                    }
                }
            }
        }
        if (this._xhr && this._xhr.readyState === 4 && ((statusCode >= 200 && statusCode < 300) || statusCode === 304)) {
            // Happy path!
            var resp = {
                url: this._xhr.responseURL || this._url,
                method: this._action,
                requestOptions: this._options,
                requestHeaders: this._xhrRequestHeaders || {},
                statusCode: statusCode,
                statusText: statusText,
                headers: headers,
                body: body
            };
            this._deferred.resolve(resp);
        }
        else {
            var errResp = {
                url: (this._xhr ? this._xhr.responseURL : undefined) || this._url,
                method: this._action,
                requestOptions: this._options,
                requestHeaders: this._xhrRequestHeaders || {},
                statusCode: statusCode,
                statusText: statusText,
                headers: headers,
                body: body,
                canceled: this._aborted,
                timedOut: this._timedOut
            };
            if (this._options.augmentErrorResponse) {
                this._options.augmentErrorResponse(errResp);
            }
            // Policy-adaptable failure
            var handleResponse = this._options.customErrorHandler
                ? this._options.customErrorHandler(this, errResp)
                : DefaultErrorHandler(this, errResp);
            var retry = handleResponse !== ErrorHandlingType.DoNotRetry && ((this._options.retries && this._options.retries > 0) ||
                handleResponse === ErrorHandlingType.PauseUntilResumed ||
                handleResponse === ErrorHandlingType.RetryUncountedImmediately ||
                handleResponse === ErrorHandlingType.RetryUncountedWithBackoff);
            if (retry) {
                if (handleResponse === ErrorHandlingType.RetryCountedWithBackoff) {
                    this._options.retries--;
                }
                if (this._requestTimeoutTimer) {
                    exports.SimpleWebRequestOptions.clearTimeout(this._requestTimeoutTimer);
                    this._requestTimeoutTimer = undefined;
                }
                this._aborted = false;
                this._timedOut = false;
                this._finishHandled = false;
                // Clear the XHR since we technically just haven't started again yet...
                if (this._xhr) {
                    this._xhr.onabort = null;
                    this._xhr.onerror = null;
                    this._xhr.onload = null;
                    this._xhr.onprogress = null;
                    this._xhr.onreadystatechange = null;
                    this._xhr.ontimeout = null;
                    this._xhr = undefined;
                    this._xhrRequestHeaders = undefined;
                }
                if (handleResponse === ErrorHandlingType.PauseUntilResumed) {
                    this._paused = true;
                }
                else if (handleResponse === ErrorHandlingType.RetryUncountedImmediately) {
                    this._enqueue();
                }
                else {
                    this._retryTimer = exports.SimpleWebRequestOptions.setTimeout(function () {
                        _this._retryTimer = undefined;
                        _this._enqueue();
                    }, this._retryExponentialTime.getTimeAndCalculateNext());
                }
            }
            else {
                // No more retries -- fail.
                this._deferred.reject(errResp);
            }
        }
        // Freed up a spot, so let's see if there's other stuff pending
        SimpleWebRequestBase.checkQueueProcessing();
    };
    return SimpleWebRequest;
}(SimpleWebRequestBase));
exports.SimpleWebRequest = SimpleWebRequest;
