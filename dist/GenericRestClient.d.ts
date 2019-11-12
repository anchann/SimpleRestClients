/**
 * GenericRestClient.ts
 * Author: David de Regt
 * Copyright: Microsoft 2015
 *
 * Base client type for accessing RESTful services
 */
import * as SyncTasks from 'synctasks';
import { WebRequestOptions, WebResponse, Headers } from './SimpleWebRequest';
export declare type HttpAction = 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH';
export interface ApiCallOptions extends WebRequestOptions {
    backendUrl?: string;
    excludeEndpointUrl?: boolean;
    eTag?: string;
}
export interface ETagResponse<T> {
    eTagMatched?: boolean;
    response?: T;
    eTag?: string;
}
export declare class GenericRestClient {
    protected _endpointUrl: string;
    protected _defaultOptions: ApiCallOptions;
    constructor(endpointUrl: string);
    protected _performApiCall<T>(apiPath: string, action: HttpAction, objToPost: any, givenOptions?: ApiCallOptions): SyncTasks.Promise<WebResponse<T, ApiCallOptions>>;
    protected _getHeaders(options: ApiCallOptions): Headers;
    protected _blockRequestUntil(options: ApiCallOptions): SyncTasks.Promise<void> | undefined;
    protected _processSuccessResponse<T>(resp: WebResponse<T, ApiCallOptions>): void;
    performApiGet<T>(apiPath: string, options?: ApiCallOptions): SyncTasks.Promise<T>;
    performApiGetDetailed<T>(apiPath: string, options?: ApiCallOptions): SyncTasks.Promise<WebResponse<T, ApiCallOptions>>;
    performApiPost<T>(apiPath: string, objToPost: any, options?: ApiCallOptions): SyncTasks.Promise<T>;
    performApiPostDetailed<T>(apiPath: string, objToPost: any, options?: ApiCallOptions): SyncTasks.Promise<WebResponse<T, ApiCallOptions>>;
    performApiPatch<T>(apiPath: string, objToPatch: any, options?: ApiCallOptions): SyncTasks.Promise<T>;
    performApiPatchDetailed<T>(apiPath: string, objToPatch: any, options?: ApiCallOptions): SyncTasks.Promise<WebResponse<T, ApiCallOptions>>;
    performApiPut<T>(apiPath: string, objToPut: any, options?: ApiCallOptions): SyncTasks.Promise<T>;
    performApiPutDetailed<T>(apiPath: string, objToPut: any, options?: ApiCallOptions): SyncTasks.Promise<WebResponse<T, ApiCallOptions>>;
    performApiDelete<T>(apiPath: string, objToDelete?: any, options?: ApiCallOptions): SyncTasks.Promise<T>;
    performApiDeleteDetailed<T>(apiPath: string, objToDelete: any, options?: ApiCallOptions): SyncTasks.Promise<WebResponse<T, ApiCallOptions>>;
}
