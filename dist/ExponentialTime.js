"use strict";
/**
 * ExponentialTime.ts
 * Author: David de Regt
 * Copyright: Microsoft 2016
 *
 * Timer to be used for exponential backoff.  Integrates jitter so as to not slam all services at the same time after backoffs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./utils");
exports.DEFAULT_TIME_GROW_FACTOR = 2.7182818284590451;
exports.DEFAULT_TIME_JITTER = 0.11962656472;
var ExponentialTime = /** @class */ (function () {
    /**
     * @param initialTime  multiplier of exponent
     * @param maxTime      delays won't be greater than this
     * @param growFactor   base of exponent
     * @param jitterFactor
     */
    function ExponentialTime(_initialTime, _maxTime, _growFactor, _jitterFactor) {
        if (_growFactor === void 0) { _growFactor = exports.DEFAULT_TIME_GROW_FACTOR; }
        if (_jitterFactor === void 0) { _jitterFactor = exports.DEFAULT_TIME_JITTER; }
        this._initialTime = _initialTime;
        this._maxTime = _maxTime;
        this._growFactor = _growFactor;
        this._jitterFactor = _jitterFactor;
        utils_1.assert(this._initialTime > 0, 'Initial delay must be positive');
        utils_1.assert(this._maxTime > 0, 'Delay upper bound must be positive');
        utils_1.assert(this._growFactor >= 0, 'Ratio must be non-negative');
        utils_1.assert(this._jitterFactor >= 0, 'Jitter factor must be non-negative');
        this.reset();
    }
    ExponentialTime.prototype.reset = function () {
        this._incrementCount = 0;
        // Differ from java impl -- give it some initial jitter
        this._currentTime = Math.round(this._initialTime * (1 + Math.random() * this._jitterFactor));
    };
    ExponentialTime.prototype.getTime = function () {
        return this._currentTime;
    };
    ExponentialTime.prototype.getIncrementCount = function () {
        return this._incrementCount;
    };
    ExponentialTime.prototype.calculateNext = function () {
        var delay = this._currentTime * this._growFactor;
        if (delay > this._maxTime) {
            delay = this._maxTime;
        }
        if (this._jitterFactor < 0.00001) {
            this._currentTime = delay;
        }
        else {
            this._currentTime = Math.round(Math.random() * delay * this._jitterFactor + delay);
        }
        if (this._currentTime < this._initialTime) {
            this._currentTime = this._initialTime;
        }
        if (this._currentTime > this._maxTime) {
            this._currentTime = this._maxTime;
        }
        this._incrementCount++;
        return this._currentTime;
    };
    /**
     * @return first call returns initialTime, next calls will return initialTime*growFactor^n + jitter
     */
    ExponentialTime.prototype.getTimeAndCalculateNext = function () {
        var res = this.getTime();
        this.calculateNext();
        return res;
    };
    return ExponentialTime;
}());
exports.ExponentialTime = ExponentialTime;
