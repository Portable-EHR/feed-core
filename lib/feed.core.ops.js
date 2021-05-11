/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { repr, isFunction, } = require('../../nodeCore/lib/utils');
const { EFlow, eFlowsToBackend, eFlowsToFeed, Unpacking, FeedHubError, FeedOp, } = require('./feed.core');

const { FeedHubApiResponse, isFeedHubStatusOk } = require('../../nodeCore/lib/api');

const self = module.exports;

Object.assign(self, {EFlow, eFlowsToBackend, eFlowsToFeed});

const feedItemJson = feedItem =>
                                feedItem._srcJson ? feedItem._srcJson
                                                   : Object.defineProperty(feedItem, '_srcJson', {value:
                                                                            JSON.stringify(feedItem)})._srcJson;
const feedItemStr = feedItem =>
                                feedItem ?  `feedItem : ${feedItemJson(feedItem)}` : '';

//region FeedOps: Pull(s), Response, Push, and Retire


const feedItemConstructorBuilder = (FeedItemName, eDirection) => {
    const FeedItemConstructor = {[FeedItemName]: function() {}}[FeedItemName];

    Object.defineProperty(FeedItemConstructor, ' Name', { get() { return FeedItemName; }});
    Object.defineProperty(FeedItemConstructor, 'FeedItemName', {get() { return FeedItemName;}});
    Object.defineProperty(FeedItemConstructor, 'eDirection', {get() { return eDirection;}});

    return (feedOp, srcJsObItem) =>
        Object.defineProperty(
        Object.defineProperty(srcJsObItem, 'constructor',   {value: FeedItemConstructor, writable: true}),
                                           '_feedOp',       {value: feedOp});
};

class FeedPullSingle extends FeedOp {

    constructor(feed, params={}, {verbose=undefined, ...timeOutInMs_maxAttempts_extraOptions}={}) {
        super(feed);
        this.setupWith(params);
        this._cachePullClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions});
    }

    setupWith(params) {                                                              //  Candidate for overriding
        this.params = params;
        return this;
    }   //  this._extra = {}    //  Set late in .pullJsObItemFromSrc() in case a same pullFromSrc() is done twice.

    get feedhubRequestParameters() { throw new Error(`get ${this.Name}.prototype.feedhubRequestParameters() : Not defined yet. Override me !`);}

    //  ._cachePull*Closure is intimately linked to ._pullRawItem, the first provides the closure that the second runs.
    _cachePullClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) { throw new Error(`${this.Name}.prototype._cachePullClosure({verbose=${verbose}, ...timeOutInMs_maxAttempts_extraOptions=${JSON.stringify(timeOutInMs_maxAttempts_extraOptions)}}) : Not defined yet. Run ${this.Name}.Setup() !`); }
    _cachePullFromFeedClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) { throw new Error(`${this.Name}.prototype._cachePullFromFeedClosure({verbose=${verbose}, ...timeOutInMs_maxAttempts_extraOptions=${JSON.stringify(timeOutInMs_maxAttempts_extraOptions)}}) : Not defined yet. Override me !`);}
    _cachePullFromFeedHubClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) {
        const { Post } = this.endpoint.web,
                options = {verbose, ...timeOutInMs_maxAttempts_extraOptions};

        this.webRequest = ({path, postBody}) =>
                                                Post({path, postBody}, options);
    }   //  non-generic : Candidate for Overriding

    async _pullRawItem() { throw new Error(`${this.Name}.prototype._pullRawItem() : Run ${this.Name}.Setup() !`); }
    async _pullRawItemFromFeed() { throw new Error(`${this.Name}.prototype._pullRawItemFromFeed() : Not defined yet. Override me !`); }
    async _pullRawItemFromFeedHub() {                                                       //  Candidate for Overriding
        const { webRequest, path, command, feedAlias, feedhubRequestParameters:parameters } = this;
        return await webRequest({path, postBody:{ feedAlias, command, parameters }});
    };

    _extractFromRawResponse(rawResponse) {throw new Error(`${this.Name}._extractFromRawResponse(rawResponse[${rawResponse}]) : Not defined yet. Run ${this.Name}.Setup() !`);}
    _extractFromRawFeedResponse(rawResponse) {throw new Error(`${this.Name}._extractFromRawFeedResponse(rawResponse[${rawResponse}]) : Not defined yet.  Override me !`);}
    _extractFromRawFeedHubResponse(rawResponse) {
        const {body, statusCode2XX:statusCode, msgHead} = rawResponse;
        Object.assign(this._extra, {msgHead, statusCode});
        let feedhubError;
        try {
            const pullResponse = JSON.parse(body);
            const {requestStatus, responseContent} = pullResponse; //  an FeedHubApiResponse
            if (isFeedHubStatusOk(requestStatus)) {
                Object.assign(this._extra, {pullResponse});
                return responseContent;
            }
            feedhubError = FeedHubError({msgHead, statusCode, requestStatus});
        } catch (e) {
            const {Name, FeedItemName} = this;
            throw Unpacking(e, msgHead,`${Name}._extractFromRawFeedHubResponse of ${FeedItemName} (HTTP statusCode [${
                            statusCode}]) : `, `Unexpected ${!body ? 'empty ' : ''}json body: `, body);
        }
        throw feedhubError;
    }

    //  "generic" (eDirection-independent) version, returns a srcJsObItem.
    async pullJsObItemFromSrc() {
        this._extra = {};   //  to add src specific detail, while in _extractFromRaw{Feed|FeedHub}Response, used in feedItem.
        return this._extractFromRawResponse(await this._pullRawItem());
    };
    async _pullJsObItemFromFeed() { throw new Error(`${this.Name}.prototype._pullJsObItemFromFeed() : Not defined yet. Override me !`); }

    get tag() { return `${this.Name}.pullFromSrc(feedItemId[${this.feedItemId}])`; }

    _buildFeedItemFromJsOb(feedOp, srcJsObItem) { throw new Error(`${this.Name}.prototype._buildFeedItemFromJsOb(feedPullSingle[${(({constructor:{name}={}})=>name)(feedOp)}], srcJsObItem${JSON.stringify(srcJsObItem)}) : Not defined yet. Override me !`); }
    _buildFeedItemFromFeedJsOb(feedOp, srcJsObItem) { throw new Error(`${this.Name}.prototype._buildFeedItemFromFeedJsOb(feedPullSingle[${(({constructor:{name}={}})=>name)(feedOp)}], srcJsObItem${JSON.stringify(srcJsObItem)}) : Not defined yet. Override me !`); }

    //  "generic" (eDirection-independent) version, returns a feedItem. Defined in Setup().
    async pullFromSrc() {
        try {
            return await this._buildFeedItemFromJsOb(this, await this.pullJsObItemFromSrc());
        }
        catch (e) {
            this._handleError(e);
        }
    }
    async _pullFromFeed() { throw new Error(`${this.Name}.prototype._pullFromFeed() : Not defined yet. Override me !`);}

    get FeedItemName() { throw new Error(`${this.Name}.prototype.FeedItemName : Not defined yet. Override me !`); }
    static get FeedItemName() { throw new Error(`${this.Name}.FeedItemName : Not defined yet. Override me !`); }
    static get NameOfFeedItem() { throw new Error(`${this.Name}.NameOfFeedItem : Not defined yet. Override me !`); }
    static get eDirectionOfFeedItem() { throw new Error(`${this.Name}.eDirectionOfFeedItem : Not defined yet. Override me !`); }
    static get command() { return 'pullSingle'; }                                       //  Candidate for Overriding !
    static Setup(FeedSpecificSetup=()=>{}) {                                            //  Candidate for Overriding
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.


        const { NameOfFeedItem:FeedItemName, eDirectionOfFeedItem:eDirection } = This;
        if (EFlow !== eDirection.Enum) {
            throw Error(`${This.Name} .Setup() argument eDirection [${eDirection}] is not one of ${EFlow._name}: [${EFlow.join()}].`);
        }
        const isFromFeed = eDirection !== eFlowsToFeed;                         //  Therefore, pullItem from Feed


        // static properties

        Object.defineProperty(This, 'FeedItemName', {value: FeedItemName});
        Object.defineProperty(This, 'isFromFeed', {value: isFromFeed});

        // non-static properties            (using function, not arrow function, to get access to instance "this")
        const thisProto = This.prototype;

        Object.defineProperty(thisProto, 'FeedItemName', {value: FeedItemName});
        Object.defineProperty(thisProto, 'isFromFeed', {value: isFromFeed});


        FeedSpecificSetup(This);

        const baseProto = FeedPullSingle.prototype;
        This.SetupFeedHub(baseProto, {eDirection,  isOfFeed:isFromFeed});

        //  No need to cache, neither self-reAssign FeedPullSingle.prototype._cachePullFromFeedHubClosure.
        thisProto._cachePullClosure = isFromFeed  ?  thisProto._cachePullFromFeedClosure
                                                  :  thisProto._cachePullFromFeedHubClosure;

        //  No need to cache, neither self-reAssign FeedPullSingle.prototype._pullRawItemFromFeedHub.
        thisProto._pullRawItem = isFromFeed  ?  thisProto._pullRawItemFromFeed
                                             :  thisProto._pullRawItemFromFeedHub;

        //  No need to cache, neither self-reAssign FeedPullSingle.prototype._pullRawItemFromFeedHub.
        thisProto._extractFromRawResponse = isFromFeed  ?  thisProto._extractFromRawFeedResponse
                                                        :  thisProto._extractFromRawFeedHubResponse;

        //region "generic" (eDirection-independent) method definitions

        baseProto._pullJsObItemFromFeedHub = baseProto.pullJsObItemFromSrc;
        thisProto.pullJsObItemFromSrc = isFromFeed  ?  thisProto._pullJsObItemFromFeed
                                                    :  thisProto._pullJsObItemFromFeedHub;

        baseProto._buildFeedItemFromJsOb = feedItemConstructorBuilder(FeedItemName, eDirection);
        baseProto._buildFeedItemFromFeedHubJsOb = baseProto._buildFeedItemFromJsOb;
        thisProto._buildFeedItemFromJsOb = isFromFeed  ?  thisProto._buildFeedItemFromFeedJsOb
                                                      :  thisProto._buildFeedItemFromFeedHubJsOb;

        baseProto._pullFromFeedHub = baseProto.pullFromSrc;
        thisProto.pullFromSrc = isFromFeed  ?  thisProto._pullFromFeed
                                            :  thisProto._pullFromFeedHub;
        //endregion

        return This;
    }
}
self.FeedPullSingle = FeedPullSingle;

class FeedPullBundle extends FeedOp {
    constructor(feed, srcPullParams, {verbose=undefined, ...timeOutInMs_maxAttempts_extraOptions}={}) {
        super(feed);

        const { maxItems=-1, chunkMaxItems=this.ChunkMaxItems } = srcPullParams;
        srcPullParams.chunkMaxItems = (0 < maxItems  &&  maxItems < chunkMaxItems)  ?  maxItems  :  chunkMaxItems;
        this.setupWith(srcPullParams);
        this._cachePullClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions});
    }   //  NOTE: ._cachePullClosure() isn't included in ._initialize(), override if needed.

    setupWith(srcPullParams) {                                                              //  Candidate for overriding
        //  In normal PumpAction, maxItems is undefined and thus defaults to -1, and chunkMaxItems stays fix.
        this.srcPullParams = srcPullParams;
        this.dstPullParams = (this._DstPullParams)(srcPullParams);
        //  this._extra = {}    //  Set late in ._buildFromPulledChunk() in case a pullFromSrc() is done twice.
        return this;
    }   //  NOTE: ._cachePullClosure() isn't included in ._initialize(), override if needed.

    get offset() { return this.srcPullParams.offset; }
    get offsetZeroBased() { return this.offset; }                                           //  Candidate for Overriding
    addItemCache(itemCache) { this.itemCache = itemCache; return this; }

    get feedhubRequestParameters() { return this.dstPullParams; }
    get ChunkMaxItems() { throw new Error(`get ${this.Name}.prototype.ChunkMaxItems : Not defined yet. Run ${this.Name}.Setup() !`); }

    //  ._cachePull*Closure is intimately linked to ._pullRawChunk, the first provides the closure that the second runs.
    _cachePullClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) { throw new Error(`${this.Name}.prototype._cachePullClosure({verbose=${verbose}, ...timeOutInMs_maxAttempts_extraOptions=${JSON.stringify(timeOutInMs_maxAttempts_extraOptions)}}) : Not defined yet. Run ${this.Name}.Setup() !`);}
    _cachePullFromFeedClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) { throw new Error(`${this.Name}.prototype._cachePullFromFeedClosure({verbose=${verbose}, ...timeOutInMs_maxAttempts_extraOptions=${JSON.stringify(timeOutInMs_maxAttempts_extraOptions)}}) : Not defined yet. Override me !`);}
    _cachePullFromFeedHubClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) {
        const { Post } = this.endpoint.web,
                options = {verbose, ...timeOutInMs_maxAttempts_extraOptions};

        this.webRequest = ({path, postBody}) =>
                                                Post({path, postBody}, options);
    } //  non-generic, non-critical:  Candidate for Overriding

    async _pullRawChunk() { throw new Error(`${this.Name}._pullRawChunk() : Not defined yet. Run ${this.Name}.Setup() !`);}
    async _pullRawChunkFromFeed() { throw new Error(`${this.Name}._pullRawChunkFromFeed() : Not defined yet. Override me !`);}
    async _pullRawChunkFromFeedHub() {
        const { webRequest, path, command, feedAlias, feedhubRequestParameters:parameters } = this;
        return webRequest({path, postBody:{feedAlias, command, parameters}});
    }

    // generic (eDirection-independent)
    async _buildFromPulledChunk() {
        this._extra = {};   //  to add src specific detail, while in _ExtractFromRaw{Feed|FeedHub}Chunk, used in feedBundleResponse.
        const pulledChunk = await this._pullRawChunk();
        return this.ResponseClass.BuildFromRawChunk(pulledChunk, this);
    }
    async _buildFromFeedChunk() { throw new Error(`${this.Name}._buildFromFeedChunk() : Not defined yet. Run ${this.Name}.Setup() !`);}
    async _buildFromFeedHubChunk() { throw new Error(`${this.Name}._buildFromFeedHubChunk() : Not defined yet. Run ${this.Name}.Setup() !`);}

    get tag() { return `${this.Name}.pullFromSrc(${JSON.stringify(this.dstPullParams)})`; }

    /**
     *
     * @returns {Promise<FeedBundleResponse>}
     */
    async pullFromSrc() {   //  "generic" (eDirection-independent), returns a feedItem.
        const { maxItems=-1 } = this.srcPullParams;
        try {
            const firstBundle = await this._buildFromPulledChunk();
            //  We can also imagine a maxItems === 0 meaning : just addChunkToBundle until hasMore === false.
            //  All the use cases for that are already using the maxItems < 0 mechanism where we do continue until
            //  hasMore === false, but with control of the hasMore from "outside" and processing of the payload on
            //  the fly, modulo chunks of size chunkMaxItems. So we reserve maxItems === 0 for future uses.
            if (maxItems < 0) {                             //  akin to Endpoint._webRequest with maxAttempts < 0
                return firstBundle
            }
            else {
                const offset = this.offsetZeroBased;
                const {chunkMaxItems, ...rest} = this.srcPullParams;
                const {feed, itemCache} = this;

                const maxI = offset + maxItems;
                // Note:  firstBundle.hasMore is modified by addChunkToBundle
                for (let i = offset + firstBundle.length; i < maxI && firstBundle.hasMore; i += chunkMaxItems) {
                    // Avoid getting more and dropping them
                    const nextPull = new this.constructor(feed, {...rest, chunkMaxItems,
                        offset:i, maxItems:maxI-i}).addItemCache(itemCache); // offset and maxItems of rest are overwritten
                    const nextChunk = await nextPull._buildFromPulledChunk();
                    firstBundle.addChunckToBundle(nextChunk);
                }
                return firstBundle;
            }
        }
        catch (e) {
            this._handleError(e);
        }
    }
    async _pullFromFeed() { throw new Error(`${this.Name}.prototype._pullFromFeed() : Not defined yet. Override me !`);}
    async _pullFromFeedHub() { throw new Error(`${this.Name}.prototype._pullFromFeedHub() : Not defined yet. Run ${this.Name}.Setup() !`);}

    static get FeedItemName() { throw new Error(`${this.Name}.FeedItemName : Not defined yet. Override me !`); }
    static get ResponseClass() { throw new Error(`${this.Name}.ResponseClass : Not defined yet. Override me !`); }
    static get Criteria() { throw new Error(`${this.Name}.Criteria : Not defined yet. Override me !`);}
    static get Criterias() { throw new Error(`${this.Name}.Criterias : Not defined yet. Override me !`);}
    static get eDirection() { throw new Error(`${this.Name}.eDirection : Not defined yet. Run ${this.Name}.Setup() !`);}
    /**
     *
     * @returns {function(object):object}
     * @private
     */
    get _DstPullParams() { throw new Error(`${this.Name}._DstPullParams : Not defined yet. Run ${this.Name}.Setup() !`);}
    get FeedItemName() { throw new Error(`${this.Name}.prototype.FeedItemName : Not defined yet. Override me !`); }
    get ResponseClass() { return this.constructor.ResponseClass; }
    // noinspection JSUnusedGlobalSymbols
    get Criteria() { return this.constructor.Criteria; }
    get eDirection() { throw new Error(`${this.Name}.prototype.eDirection : Not defined yet. Run ${this.Name}.Setup() !`);}
    //  Prevents FeedOp.SetupFeedHub() to throw.  FeedPullBundle.prototype.id itself is overridden in Setup() below.
    static get getFeedItemId() { return ()=>undefined; }        //  also override .feedItemId directly in .Setup()
    static get command() { return 'pullBundle'; }                                   //  Candidate for overriding !
    static get ChunkMaxItems() { return undefined; }                                //  Candidate for overriding !
    static Setup(FeedSpecificSetup=()=>{}) {                                        //  Candidate for overriding !
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.

        const { ResponseClass } = This;

        if ( ! (isFunction(ResponseClass) && ResponseClass.prototype instanceof FeedBundleResponse)) {
            throw Error(`${This.Name}.ResponseClass [${repr(ResponseClass)}] is not an extension of ${FeedBundleResponse.name}.`);
        }

        const {FeedItemName, eDirection} = ResponseClass;               //  pre-Validated by FeedBundleResponse.Setup()
        const isFromFeed = eDirection !== eFlowsToFeed;                 //  isToFeedHub, hence isFromFeed.

        // static properties

        Object.defineProperty(This, 'FeedItemName', {value: FeedItemName});
        Object.defineProperty(This, 'isFromFeed', {value: isFromFeed});

        // non-static properties            (using function, not arrow function, to get access to instance "this")
        const thisProto = This.prototype;

        Object.defineProperty(thisProto, 'FeedItemName', {value: FeedItemName});
        Object.defineProperty(thisProto, 'isFromFeed', {value: isFromFeed});
        Object.defineProperty(thisProto, 'ResponseClass', {value:ResponseClass});

        FeedSpecificSetup(This);

        if ( ! isFromFeed ) {           //  isFromFeedHub               //  fancy eDirection-dependent default value
            Object.defineProperty(thisProto, 'ChunkMaxItems', {value: This.ChunkMaxItems || 1000});
            Object.defineProperty(This, 'Criterias', {value: This.FeedHubCriterias});
        }                                           // Find as early as possible if Criteria was defined
        Object.defineProperty(thisProto, '_DstPullParams', {value: This.Criteria});

        const baseProto = FeedPullBundle.prototype;
        This.SetupFeedHub(baseProto, {eDirection, isOfFeed:isFromFeed});
                                                                //  Overrides FeedOp's {get:This.getFeedItemId()}
        Object.defineProperty(thisProto, 'feedItemId', {configurable: true, value:undefined});

        //  No need to cache, neither self-reAssign FeedPullBundle.prototype._cachePullFromFeedHubClosure.
        thisProto._cachePullClosure = isFromFeed  ?  thisProto._cachePullFromFeedClosure
                                                  :  thisProto._cachePullFromFeedHubClosure;

        //  No need to cache, neither self-reAssign FeedPullBundle.prototype._pullRawChunkFromFeedHub.
        thisProto._pullRawChunk = isFromFeed  ?  thisProto._pullRawChunkFromFeed
                                              :  thisProto._pullRawChunkFromFeedHub;

        //region "generic" (eDirection-independent) method definitions

        baseProto._buildFromFeedHubChunk = baseProto._buildFromPulledChunk;
        thisProto._buildFromPulledChunk = isFromFeed  ?  thisProto._buildFromFeedChunk
                                                      :  thisProto._buildFromFeedHubChunk;

        baseProto._pullFromFeedHub = baseProto.pullFromSrc;
        thisProto.pullFromSrc = isFromFeed  ?  thisProto._pullFromFeed  //  re-Assignment at thisProto-level, see above.
                                            :  thisProto._pullFromFeedHub;
        //endregion

        return This;
    }
}
//  The srcPullParams are morphed to dstPullParams for FeedHub
self.FeedPullBundle = FeedPullBundle;
Object.defineProperty(FeedPullBundle, "FeedHubCriterias", {value: Object.freeze({
    None: () => ({   //  returns empty ob for dstParams; undefined would do too but JSON.stringify({}) makes better log.
    }),
    Slice: ({offset, chunkMaxItems:maxItems}) => ({
        offset,
        maxItems
    }),
    SliceOfPeriod: ({since, offset, chunkMaxItems:maxItems}) => ({
        since   : 'string' === typeof(since)  ?  since  :  since.toJSON(),
        offset,
        maxItems
    }),
})});

class FeedBundleResponse {

    constructor(feedPullBundle, offset=0, hasMore=false)    {
        Object.defineProperty(this, '_feedPullBundle', {value: feedPullBundle});
        //  A place to transfer _extra, src specific detail, added while in feedPullBundle ._ExtractFromRaw{Feed|FeedHub}Chunk.
        //  Well finally, until a valid use case, don't transfer: link to pullBundle instead (unlikely needed)
        //  Object.defineProperty(this, '_extra', {value: feedPullBundle._extra});
        this.offset  = offset;
        this.hasMore = hasMore;
        this.results = this.newResults();
    }
    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }
    get feedTag() { return this._feedPullBundle.feedTag; }
    get _extra() { return this._feedPullBundle._extra; }
    get _feedOp() { return this._feedPullBundle; }

    /**
     *
     * @returns {object[]}
     */
    newResults() { return []; }
    toString() { return JSON.stringify(this); }                                       //  Candidate for overriding !

    get length() { return this.results.length; }
    [Symbol.iterator]() { return this.results[Symbol.iterator](); }


    //  NOTE
    //
    //  All FeedOp based ErrorHandling is delegated to the FeedPullBundle which calls embed the FeedBunldeResponse calls.

    //  Non-"generic" (eDirection-dependent) and Critical, therefore defined in Setup().
    /**
     *
     * @param pulledChunk
     * @param {FeedPullBundle} feedPullBundle
     * @returns {{offset: number, hasMore: boolean, results: Array}}
     * @private
     */
    static _ExtractFromRawChunk(pulledChunk, feedPullBundle) { throw new Error(`${this.Name}._ExtractFromRawChunk(pulledChunk[${pulledChunk}], feedPullBundle[${feedPullBundle}]) :  Not defined yet. Run ${this.Name}.Setup() !`); }
    static _ExtractFromRawFeedChunk(pulledChunk, feedPullBundle) { throw new Error(`${this.Name}._ExtractFromRawFeedChunk(pulledChunk[${pulledChunk}], feedPullBundle[${feedPullBundle}]) : Not defined yet. Override me !`); }
    static _ExtractFromRawFeedHubChunk(pulledChunk, feedPullBundle) {
        const {body, statusCode2XX:statusCode, msgHead} = pulledChunk;
        Object.assign(feedPullBundle._extra, {msgHead, statusCode});
        let feedhubError;
        try {
            const pullResponse = JSON.parse(body);
            const {requestStatus, responseContent:{ offset, hasMore, results }} = pullResponse; //  an FeedHubApiResponse
            if (isFeedHubStatusOk(requestStatus)  &&  results[Symbol.iterator]) {
                return {offset, hasMore, results};
            }
            feedhubError = FeedHubError({msgHead, statusCode, requestStatus});
        } catch (e) {
            const This = this, {Name, FeedItemName} = This;                                  //  this is the static This
            throw Unpacking(e, msgHead,`${Name}._ExtractFromRawFeedHubChunk of ${FeedItemName
            } (HTTP statusCode [${statusCode}]) : `, `Unexpected ${!body ? 'empty ' : ''}json body: `, body);
        }
        throw feedhubError;
    }

    static _BuildFeedItemFromJsOb(feedOp, srcJsObItem) { throw new Error(`${this.Name}.prototype._BuildFeedItemFromJsOb(feedPullSingle[${(({constructor:{name}={}})=>name)(feedOp)}], srcJsObItem${JSON.stringify(srcJsObItem)}) : Not defined yet. Override me !`); }
    static _BuildFeedItemFromFeedJsOb(feedOp, srcJsObItem) { throw new Error(`${this.Name}.prototype._BuildFeedItemFromFeedJsOb(feedPullSingle[${(({constructor:{name}={}})=>name)(feedOp)}], srcJsObItem${JSON.stringify(srcJsObItem)}) : Not defined yet. Override me !`); }

    //  "generic" (eDirection-independent), yet Critical : defined in Setup.
    static BuildFromRawChunk(pulledChunk, feedPullBundle) {
        const This = this;
        const {offset, hasMore, results} = This._ExtractFromRawChunk(pulledChunk, feedPullBundle);
        const feedBundleResponse = new This(feedPullBundle, offset, hasMore);
        const dstResults = feedBundleResponse.results;

        for (let srcJsObItem of results) {
            dstResults.push(This._BuildFeedItemFromJsOb(feedPullBundle, srcJsObItem));
        }
        return feedBundleResponse;
    }
    static _BuildFromRawFeedChunk(pulledChunk, feedPullBundle) { throw new Error(`${this.Name}._BuildFromRawFeedChunk(pulledChunk[${pulledChunk}], feedPullBundle[${feedPullBundle}]) : Not defined yet. Override me !`); }

    //  "generic" (eDirection-independent), yet Critical : defined in Setup.
    addChunckToBundle({offset:nextOffset, hasMore:nextHasMore, results: nextResults, _extra:{msgHead}}) { // (nextChunk)
        const {offset, results} = this;
        const expectedOffset = offset + results.length;

        if (nextOffset !== expectedOffset) {
            const { feedTag, Name, FeedItemName, isFromFeed } = this;
            throw Unpacking(Error(`${FeedItemName}Bundle offset [${nextOffset}] received from ${isFromFeed ? 
                                    'Feed' : 'FeedHub'} is not matching expected [${expectedOffset}].`), msgHead,
                `${feedTag} : Failed to ${Name}.addChunckToBundle() : `);
        }   //  Not a JSON.parse() error, yet an Unpacking one.      Unpacking results in API error MALFORMED.
        this.hasMore = nextHasMore;
        this.results = results.concat(nextResults);
        return this;
    }
    _addFeedChunckToBundle(srcChunk) {throw new Error(`${this.Name}.prototype._addFeedChunckToBundle(srcChunk[${srcChunk}]) : Not defined yet. Override me !`);}


    static get NameOfFeedItem() { throw new Error(`${this.Name}.NameOfFeedItem : Not defined yet. Override me !`); }
    static get eDirectionOfFeedItem() { throw new Error(`${this.Name}.eDirectionOfFeedItem : Not defined yet. Override me !`); }
    static Setup(FeedSpecificSetup=()=>{}) {                                    //  Candidate for overriding.
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
        const BaseClass = FeedBundleResponse;

        const { NameOfFeedItem:FeedItemName, eDirectionOfFeedItem:eDirection } = This;
        if (EFlow !== eDirection.Enum) {
            throw Error(`${This.Name} .Setup() argument eDirection [${eDirection}] is not one of ${EFlow._name}: [${EFlow.join()}].`);
        }
        const isFromFeed = eDirection !== eFlowsToFeed;                     //  ! isToFeedHub, hence isFromFeed.

        // static Properties

        Object.defineProperty(This, 'eDirection', {value: eDirection});
        Object.defineProperty(This, 'isFromFeed', {value: isFromFeed});
        Object.defineProperty(This, 'FeedItemName', {value: FeedItemName});


        // non-static properties            (using function, not arrow function, to get access to instance "this")
        const thisProto = This.prototype;
        const baseProto = BaseClass.prototype;


        Object.defineProperty(thisProto, 'eDirection', {value: eDirection});
        Object.defineProperty(thisProto, 'isFromFeed', {value: isFromFeed});
        Object.defineProperty(thisProto, 'FeedItemName', {value: FeedItemName});

        FeedSpecificSetup(This);

        if ( ! isFromFeed ) {           //  isFromFeedHub                       //  eDirection-dependent definition
        }

        This._ExtractFromRawChunk = isFromFeed  ?  This._ExtractFromRawFeedChunk
                                                :  This._ExtractFromRawFeedHubChunk;

        //region "generic" (eDirection-independent) method definitions

        BaseClass._BuildFeedItemFromJsOb = feedItemConstructorBuilder(FeedItemName, eDirection);
        BaseClass._BuildFeedItemFromFeedHubJsOb = BaseClass._BuildFeedItemFromJsOb;
        This._BuildFeedItemFromJsOb = isFromFeed  ?  This._BuildFeedItemFromFeedJsOb
                                                  :  This._BuildFeedItemFromFeedHubJsOb;

        BaseClass._BuildFromRawFeedHubChunk = BaseClass.BuildFromRawChunk;
        This.BuildFromRawChunk = isFromFeed  ?  This._BuildFromRawFeedChunk
                                             :  This._BuildFromRawFeedHubChunk;

        baseProto._addFeedHubChunckToBundle = baseProto.addChunckToBundle;
        thisProto.addChunckToBundle = isFromFeed  ?  thisProto._addFeedChunckToBundle
                                                  :  thisProto._addFeedHubChunckToBundle;

        //endregion

        return This;
    }
}
self.FeedBundleResponse = FeedBundleResponse;

class FeedPushSingle extends FeedOp {   //  Both the 'generic' AND the FeedHub implementation.

    /**
     *
     * @param {Feed} feed
     * @param {object} feedItem
     * @param {string} trackingId
     * @param {boolean} verbose
     * @param {...object} timeOutInMs_maxAttempts_extraOptions
     */
    constructor(feed, {feedItem, trackingId=undefined}, {verbose=undefined, ...timeOutInMs_maxAttempts_extraOptions}={}) {
        super(feed);
        this.setupWith({feedItem, trackingId});
        //  this._extra = {}    //  Set late in .pushToDst() and .getAtomicPushToDstClosure() in case a feedPushSingle is reused.
        this._cachePushClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions});
    }

    setupWith({feedItem, trackingId=undefined}) {
        Object.assign(this, { feedItem, trackingId });
        //  this._extra = {}    //  Set late in .pushToDst() and .getAtomicPushToDstClosure() in case a feedPushSingle is reused.
        return this;
    }                                                                                   //  Candidate for overriding
    get feedItemTag() {
        return this.feedItemId;
    }                                                                                   //  Candidate for Overriding !

    //  ._cachePush*Closure is intimately linked to ._pushRawItem*: the first provides the partial closure that the
    //  second runs and passes arguments to, creating and using a property that is eDirection and techno dependent.
    _cachePushClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) { throw new Error(`${this.Name}.prototype._cachePushClosure({verbose=${verbose}, ...timeOutInMs_maxAttempts_extraOptions=${JSON.stringify(timeOutInMs_maxAttempts_extraOptions)}}) : Not defined yet. Run ${this.Name}.Setup() !`);}
    _cachePushToFeedClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) { throw new Error(`${this.Name}.prototype._cachePushToFeedClosure({verbose=${verbose}, ...timeOutInMs_maxAttempts_extraOptions=${JSON.stringify(timeOutInMs_maxAttempts_extraOptions)}}) : Not defined yet. Override me !`);}
    _cachePushToFeedHubClosure({verbose, ...timeOutInMs_maxAttempts_extraOptions}) {
        const { Post } = this.endpoint.web,
                options = {verbose, ...timeOutInMs_maxAttempts_extraOptions};

        this.webRequest = ({path, postBody})    =>
                                                        Post({path, postBody}, options);

        //  Passing maxAttempts = -1 causes endpoint._webRequest() to perform no webRequest per se but return
        //  the webRequest closure for a pump to perform it with full control of error handling and retry.
        const optionsForClosure = {...options, maxItems:-1};

        this.webRequestClosure = ({path, postBody}) =>
                                                        Post({path, postBody}, optionsForClosure);
    }   //  non-generic : Candidate for Overriding

    /**
     *
     * @returns {Promise<function>}
     * @private
     */
    async _pushRawItem(webRequest=this.webRequest) { throw new Error(`${this.Name}.prototype._pushRawItem(webRequest[${webRequest}]) : Not defined yet. Run ${this.Name}.Setup() !`);}
    async _pushRawItemToFeed(webRequest=this.webRequest) { throw new Error(`${this.Name}.prototype._pushRawItemToFeed(webRequest[${webRequest}]) : Not defined yet. Override me !`);}
    async _pushRawItemToFeedHub(webRequest=this.webRequest) {
        const { path, command, feedAlias, feedItem:parameters, trackingId } = this;
        return await webRequest({path, postBody:{ feedAlias, command, parameters, trackingId }});
    }

    /**
     *
     * @param rawResponse
     * @returns Object
     */
    async _extractFromRawResponse(rawResponse) { throw new Error(`${this.Name}.prototype._extractFromRawResponse(rawResponse[${rawResponse}]) : Not defined yet. Run ${this.Name}.Setup() !`);}
    async _extractFromRawFeedResponse(rawResponse) { throw new Error(`${this.Name}.prototype._extractFromRawFeeResponse(rawResponse[${rawResponse}]) : Not defined yet. Override me !`);}
    async _extractFromRawFeedHubResponse(rawResponse) {
        const {body, statusCode2XX:statusCode, msgHead} = rawResponse;
        Object.assign(this._extra, {msgHead, statusCode});
        let feedhubError;
        try {
            const {requestStatus, responseContent} = JSON.parse(body);
            if (isFeedHubStatusOk(requestStatus)) {
                return Object.defineProperty(FeedHubApiResponse({...requestStatus, responseContent}), '_feedOp', {value:this});
            }
            feedhubError = FeedHubError({msgHead, statusCode, requestStatus});
        } catch (e) {
            const {Name, FeedItemName} = this;
            throw Unpacking(e, msgHead,`${Name}._extractFromRawFeedHubResponse of ${FeedItemName
            } push to FeedHub (HTTP statusCode [${statusCode}]) : `, `Unexpected ${!body ? 'empty ' : ''}json body: `, body);
        }
        throw feedhubError;
    }

    get tag() { return `${this.Name}.pushToDst(feedItem[${this.feedItemTag}])`; }
    get srcAndDstItemStrs() {
        const { feedItem } = this;          //  No srcItem and dstItem (neither .convertToDst() for now on Feed.
        return [feedItemStr(feedItem)];
    }

    //  "generic" (eDirection-independent). Non-critical
    async pushToDst() {                                                             //  Candidate for Overriding
        this._extra = {};   //  to add dst specific detail, while in _extractFromRaw{Feed|FeedHub}Response.
        try {
            return await this._extractFromRawResponse(await this._pushRawItem());
        }
        catch (e) {
            this._handleError(e);
        }
    }
    async _pushToFeed() { throw new Error(`${this.Name}.prototype._pushToFeed() : Not defined yet. Override me !`);}
    async _pushToFeedHub() { throw new Error(`${this.Name}.prototype._pushToFeedHub() : Not defined yet. Run ${this.Name}.Setup() !`); }

    /**
     *
     * @param {Object|number}feedItem
     * @param {string|number}trackingId
     * @returns {Promise<(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>}
     */
    async getAtomicPushToDstClosure({feedItem=Infinity, trackingId=Infinity}={}) {
        if (Infinity !== feedItem)  { this.feedItem = feedItem; }     //  Assign any feedItem, trackingId that have really
        if (Infinity !== trackingId){ this.trackingId = trackingId; } //  been passed as argument (except unexpected Infinity).

        //  maxAttempts: -1 is used in webRequestClosure to cause endpoint._webRequest() to perform no webRequest per
        //  se but return the webRequest closure for a pump to perform it with full control of error handling and retry.
        //  No known way this can throw.
        const atomicPushRawItemClosure = await this._pushRawItem(this.webRequestClosure);
        const { msgHead } = atomicPushRawItemClosure;   //  Extract the .msgHead() closure attached to inner closure
        const feedPush = this;
        const atomicPushToDstClosure = async () => {
            feedPush._extra = {};   //  to add dst specific detail, while in _extractFromRaw{Feed|FeedHub}Response.
            try {
                return await feedPush._extractFromRawResponse(await atomicPushRawItemClosure());
            }
            catch (e) {     //  ._handleError(e) is NOT an arrow function closure, MUST be call with "this."
                feedPush._handleError(e);
            }
        };                                  // re-attach msgHead to outer closure, as required by PumpEngine convention
        return Object.assign(atomicPushToDstClosure, { msgHead });
    }
    /**
     *
     * @param {Object|number}feedItem
     * @param {string|number}trackingId
     * @returns {Promise<(function():Promise<{body:string, statusCode2XX:number, msgHead:(function():string)}>)>}
     */
    async _getAtomicPushToFeedClosure({feedItem, trackingId}) { throw new Error(`${this.Name}.prototype._getAtomicPushToFeedClosure({feedItem[${feedItem}], trackingId[${trackingId}]}) : Not defined yet. Override me !`);}
    async _getAtomicPushToFeedHubClosure({feedItem, trackingId}) { throw new Error(`${this.Name}.prototype._getAtomicPushToFeedHubClosure({feedItem[${feedItem}], trackingId[${trackingId}]}) : Not defined yet. Run ${this.Name}.Setup() !`);}

    static get NameOfFeedItem() { throw new Error(`${this.Name}.NameOfFeedItem : Not defined yet. Override me !`); }
    static get eDirectionOfFeedItem() { throw new Error(`${this.Name}.eDirectionOfFeedItem : Not defined yet. Override me !`); }
    static get IsUsingTrackingId() { return false; }                                //  FeedHub doesn't use trackingId !
    static get getFeedItemId() { return function() { return this.feedItem.id; } }   //  Candidate for overriding !
    static get command() { return 'pushSingle'; }                                   //  Candidate for overriding !
    static Setup(FeedSpecificSetup=()=>{}) {
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.

        const { NameOfFeedItem:FeedItemName, eDirectionOfFeedItem:eDirection } = This;
        if (EFlow !== eDirection.Enum) {
            throw Error(`${This.Name} .Setup() argument eDirection [${eDirection}] is not one of ${EFlow._name}: [${EFlow.join()}].`);
        }

        // static properties

        const isToFeed = eDirection === eFlowsToFeed;

        if ( ! isToFeed ) {           //  isToFeedHub                       //  eDirection-dependent definition
        }

        // non-static properties            (using function, not arrow function, to get access to instance "this")
        const thisProto = This.prototype;

        Object.defineProperty(thisProto, 'FeedItemName', {value: FeedItemName});
        Object.defineProperty(thisProto, 'isToFeed', {value:isToFeed});

        FeedSpecificSetup(This);

        const baseProto = FeedPushSingle.prototype;
        This.SetupFeedHub(baseProto, {eDirection, isOfFeed:isToFeed});

        //  No need to cache, neither self-reAssign FeedPushSingle.prototype._cachePushToFeedHubClosure.
        thisProto._cachePushClosure = isToFeed  ?  thisProto._cachePushToFeedClosure
                                                :  thisProto._cachePushToFeedHubClosure;

        //  No need to cache, neither self-reAssign FeedPushSingle.prototype._pushRawItemToFeedHub.
        thisProto._pushRawItem = isToFeed  ?  thisProto._pushRawItemToFeed
                                           :  thisProto._pushRawItemToFeedHub;

        //  No need to cache, neither self-reAssign FeedPushSingle.prototype._extractFromRawFeedHubResponse.
        thisProto._extractFromRawResponse = isToFeed  ?  thisProto._extractFromRawFeedResponse
                                                      :  thisProto._extractFromRawFeedHubResponse;

        //region "generic" (eDirection-independent) method definitions

        baseProto._pushToFeedHub = baseProto.pushToDst;
        thisProto.pushToDst = isToFeed  ?  thisProto._pushToFeed
                                        :  thisProto._pushToFeedHub;

        baseProto._getAtomicPushToFeedHubClosure = baseProto.getAtomicPushToDstClosure;
        thisProto.getAtomicPushToDstClosure = isToFeed  ?  thisProto._getAtomicPushToFeedClosure
                                                        :  thisProto._getAtomicPushToFeedHubClosure;
        //endregion

        return This;
    }
}
self.FeedPushSingle = FeedPushSingle;


//endregion

logger.trace("Initialized ...");
