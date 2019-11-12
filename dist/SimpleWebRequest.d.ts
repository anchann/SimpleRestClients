/**
 * SimpleWebRequest.ts
 * Author: David de Regt
 * Copyright: Microsoft 2016
 *
 * Simple client for issuing web requests.
 */
import * as SyncTasks from 'synctasks';
import { ExponentialTime } from './ExponentialTime';
interface Dictionary<T> {
    [key: string]: T;
}
export interface Headers extends Dictionary<string> {
}
export interface Params extends Dictionary<any> {
}
export interface WebTransportResponseBase {
    url: string;
    method: string;
    statusCode: number;
    statusText: string | undefined;
    headers: Headers;
}
export interface WebTransportResponse<TBody> extends WebTransportResponseBase {
    body: TBody;
}
export interface WebTransportErrorResponse extends WebTransportResponseBase {
    body: any;
    canceled: boolean;
    timedOut: boolean;
}
export interface RestRequestInResponse<TOptions = WebRequestOptions> {
    requestOptions: TOptions;
    requestHeaders: Headers;
}
export interface WebResponseBase<TOptions = WebRequestOptions> extends WebTransportResponseBase, RestRequestInResponse<TOptions> {
}
export interface WebErrorResponse<TOptions = WebRequestOptions> extends WebTransportErrorResponse, RestRequestInResponse<TOptions> {
}
export interface WebResponse<TBody, TOptions = WebRequestOptions> extends WebTransportResponse<TBody>, RestRequestInResponse<TOptions> {
}
export declare enum WebRequestPriority {
    DontCare = 0,
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4
}
export declare enum ErrorHandlingType {
    DoNotRetry = 0,
    RetryUncountedImmediately = 1,
    RetryUncountedWithBackoff = 2,
    RetryCountedWithBackoff = 3,
    PauseUntilResumed = 4
}
export interface NativeBlobFileData {
    uri: string;
    size: number;
    name: string;
    type: string;
}
export interface NativeFileData {
    file: NativeBlobFileData | File;
}
export interface XMLHttpRequestProgressEvent extends ProgressEvent {
    lengthComputable: boolean;
    loaded: number;
    path: string[];
    percent: number;
    position: number;
    total: number;
    totalSize: number;
}
export declare type SendDataType = Params | string | NativeFileData;
export interface WebRequestOptions {
    returnRawData?: true;
    withCredentials?: boolean;
    retries?: number;
    priority?: WebRequestPriority;
    timeout?: number;
    acceptType?: string;
    customResponseType?: XMLHttpRequestResponseType;
    contentType?: string;
    sendData?: SendDataType;
    headers?: Headers;
    overrideGetHeaders?: Headers;
    augmentHeaders?: Headers;
    streamingDownloadProgress?: (responseText: string) => void;
    onProgress?: (progressEvent: XMLHttpRequestProgressEvent) => void;
    customErrorHandler?: (webRequest: SimpleWebRequestBase, errorResponse: WebErrorResponse) => ErrorHandlingType;
    augmentErrorResponse?: (resp: WebErrorResponse) => void;
}
export declare const DefaultOptions: WebRequestOptions;
export interface ISimpleWebRequestOptions {
    MaxSimultaneousRequests: number;
    HungRequestCleanupIntervalMs: number;
    setTimeout: (callback: () => void, timeoutMs?: number) => number;
    clearTimeout: (id: number) => void;
}
export declare let SimpleWebRequestOptions: ISimpleWebRequestOptions;
export declare function DefaultErrorHandler(webRequest: SimpleWebRequestBase, errResp: WebTransportErrorResponse): ErrorHandlingType;
export declare abstract class SimpleWebRequestBase<TOptions extends WebRequestOptions = WebRequestOptions> {
    protected _action: string;
    protected _url: string;
    protected _getHeaders?: (() => Headers) | undefined;
    protected _blockRequestUntil?: (() => SyncTasks.STPromise<void> | undefined) | undefined;
    protected _xhr: XMLHttpRequest | undefined;
    protected _xhrRequestHeaders: Headers | undefined;
    protected _requestTimeoutTimer: number | undefined;
    protected _options: TOptions;
    protected _aborted: boolean;
    protected _timedOut: boolean;
    protected _paused: boolean;
    protected _created: number;
    protected _finishHandled: boolean;
    protected _retryTimer: number | undefined;
    protected _retryExponentialTime: ExponentialTime;
    constructor(_action: string, _url: string, options: TOptions, _getHeaders?: (() => Headers) | undefined, _blockRequestUntil?: (() => SyncTasks.STPromise<void> | undefined) | undefined);
    getPriority(): WebRequestPriority;
    abstract abort(): void;
    protected static checkQueueProcessing(): void;
    private static _scheduleHungRequestCleanupIfNeeded;
    private static _hungRequestCleanupTimerCallback;
    protected _removeFromQueue(): void;
    protected _assertAndClean(expression: any, message: string): void;
    private _fire;
    private static _setRequestHeader;
    static mapContentType(contentType: string): string;
    static mapBody(sendData: SendDataType, contentType: string): SendDataType;
    setUrl(newUrl: string): void;
    setHeader(key: string, val: string | undefined): void;
    getRequestHeaders(): Headers;
    getOptions(): Readonly<WebRequestOptions>;
    setPriority(newPriority: WebRequestPriority): void;
    resumeRetrying(): void;
    protected _enqueue(): void;
    private static _getResponseType;
    protected abstract _respond(errorStatusText?: string): void;
}
export declare class SimpleWebRequest<TBody, TOptions extends WebRequestOptions = WebRequestOptions> extends SimpleWebRequestBase<TOptions> {
    private _deferred;
    constructor(action: string, url: string, options: TOptions, getHeaders?: () => Headers, blockRequestUntil?: () => SyncTasks.Promise<void> | undefined);
    abort(): void;
    start(): SyncTasks.Promise<WebResponse<TBody, TOptions>>;
    protected _respond(errorStatusText?: string): void;
}
export {};
