/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);
const { onlyDate, commentsLitOb, Enum, EItem, ExpectedError, } = require('../../nodeCore/lib/utils');
const { WtfConfig, epoch } = require('../../nodeCore/lib/config');
const feedhubOps = require('./feedhub.ops');


const self = module.exports;

//region enums: EFeedState/EState, EFeedKind,

const EFeedState = (f=>{f.prototype=new Enum(f); return new f({});})(function EPumpState({
    booting=(f=>f(f))(function booting(f)   { return EItem(EPumpState, f); }),
    stopped=(f=>f(f))(function running(f)   { return EItem(EPumpState, f); }),
    running=(f=>f(f))(function running(f)   { return EItem(EPumpState, f); }),
    error  =(f=>f(f))(function error(f)     { return EItem(EPumpState, f); }),
}) { Enum.call(Object.assign(this, {booting, stopped, running, error})); });
const EState = EFeedState;  // convenient


const EFeedKind = (f=>{f.prototype=new Enum(f); return new f({});})(function EFeedKind({
    dispensary =(f=>f(f))(function dispensary(f)  { return EItem(EFeedKind, f); }),
    teleClinic =(f=>f(f))(function teleClinic(f)  { return EItem(EFeedKind, f); }),
}) {  Enum.call(Object.assign(this, {dispensary, teleClinic, })); });
self.EFeedKind = EFeedKind;

const {
    dispensary:         eDispensaryKind,
    teleClinic:         eTeleClinic,
} = EFeedKind;
[eDispensaryKind, eTeleClinic, ].join();    //  Kludge to prevent stupid 'unused' warnings.

const FeedByFeedKind =
 self.FeedByFeedKind = {};                  //  to be filled by lib/config.feed.

//endregion

//region Feeds

const _name = constructor => (name => name.charAt(0).toLowerCase() + name.slice(1))(constructor.name);

class Feeds {

    constructor(config) {
        Object.defineProperty(this, "_config", {value: config});
        Object.defineProperty(this, "_state", {writable:true, value:EState.booting}); // non-enumerable
    }

    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }

    //region Feeds extension utilities
    static get Feed() { return Feed; }                  //  e.g. Dispensary             //  candidate for overriding
    get Feed() { return Feed; }                                                         //  candidate for overriding

    static get Feeds() { return this; }                                         //  "this" is static This / constructor
    static get Feedsname() { return this.Name; }                                //  "this" is static This / constructor
    static get feedsname() { return _name(this); }                              //  "this" is static This / constructor
    static get Feedname() { return this.Feed.Name; }                            //  "this" is static This / constructor
    static get feedname() { return _name(this.Feed); }                          //  "this" is static This / constructor

    static get eFeedKind() { return this.Feed.eFeedKind; }

    get Feeds() { return this.constructor; }            //  e.g. Dispensaries
    get Feedsname() { return this.Name; }               //  e.g. "Dispensaries"
    get feedsname() { return _name(this.constructor); } //  e.g. "dispensaries"
    get Feedname() { return this.Feed.Name; }           //  e.g. "Dispensary"
    get feedname() { return _name(this.Feed); }         //  e.g. "dispensary"
    //endregion

    static Setup() {                                                        //  Cache it all at instance level.
        const This = this;                                                  //  "this" is the static This / constructor
        Object.defineProperty(This, 'Name', {value:This.Name});
        Object.defineProperty(This, 'Feed', {value:This.Feed});
        Object.defineProperty(This, 'Feeds', {value:This.Feeds});

        const ThisProto = This.prototype;
        Object.defineProperty(ThisProto, 'Name', {value:This.Name});
        Object.defineProperty(ThisProto, 'Feed', {value:This.Feed});
        Object.defineProperty(ThisProto, 'Feeds', {value:This.Feeds});

        Object.defineProperty(This, 'Feedsname', {value:This.Feedsname});
        Object.defineProperty(This, 'feedsname', {value:This.feedsname});
        Object.defineProperty(This, 'Feedname', {value:This.Feedname});
        Object.defineProperty(This, 'feedname', {value:This.feedname});

        Object.defineProperty(ThisProto, 'Feedsname', {value:This.Feedsname});
        Object.defineProperty(ThisProto, 'feedsname', {value:This.feedsname});
        Object.defineProperty(ThisProto, 'Feedname', {value:This.Feedname});
        Object.defineProperty(ThisProto, 'feedname', {value:This.feedname});
    }

    get config () { return this._config; }
    get enabled() { return this; }
    [Symbol.iterator]() { return Object.values(this)[Symbol.iterator](); }

    _addFeed(feed) {
        this[feed.alias] = feed;
        feed.bind();
        return feed;
    }

    //region report
    statusReportRootsUp(rootsUp) {
        return dst => this.statusReportRootsDown(dst, rootsUp);
    }
    statusReportRootsDown(dst, rootsUp) { return rootsUp.feed.statusReportRootsDown(dst, rootsUp); }
    async reportStatus(dst) {
        const result = { status:this._state };
        for (let feed of this) {
            result[feed.alias] = await feed.reportStatus();
        }
        if (dst) {
            Object.assign(dst, result);
        }
        return result;
    }
    //endregion

    //region batching
    async _batch(dispMethod, stateOnSuccess) {
        try {
            for (let feed of this)
                await dispMethod.call(feed);
            if (undefined !== stateOnSuccess) this._state = stateOnSuccess;
        }
        catch (e) {
            this._state = EState.error;
            throw e;
        }
    }

    async initialize()  { await this._batch(this.Feed.prototype.initialize, EState.stopped); }

    async start()       { await this._batch(this.Feed.prototype.start, EState.running); }

    //endregion
}
self.Feeds = Feeds;

//endregion

//region Feed

class Feed {
    /**
     *
     * @param {{feedAlias: string|undefined, verbose: boolean|undefined, epochStart:string|undefined, wtf: object, feedHubServer: string|undefined
     *          feedHubCredentials: string|undefined, _rest: ...object}} srcJsOb
     * @param feedConfigAlias
     * @param feeds
     */
    constructor(srcJsOb, feedConfigAlias, feeds) {
        Object.defineProperty(this, "_feedConfigAlias", {value: feedConfigAlias});
        Object.defineProperty(this, "_feeds", {value: feeds});
        const { config } = this;
        const configLogger = () => config._configLogger;

        //  epochStart and feedHubServer objects already built from srcJsOb in lib/config, just assign.
        const { feedAlias, verbose, epochStart, wtf, feedHubServer:ownFeedHubServerAlias,
                feedHubCredentials:ownFeedHubCredentialsAlias, ..._rest } = srcJsOb;

        Object.assign(this, {
            feedAlias, verbose,
            epochStart:         onlyDate(epochStart) || epoch(),    //  onlyDate() => undefined, if invalid date string.
            wtf:                WtfConfig(wtf),
            feedHubServer:      ownFeedHubServerAlias,
            feedHubCredentials: ownFeedHubCredentialsAlias,
        });
        Object.assign(this, commentsLitOb(_rest));

        Object.defineProperty(this, '_alias', {value: feedAlias ? feedAlias : feedConfigAlias});
        const { fullTag } = this;

        if ( onlyDate(epochStart) ) {
            configLogger().configLog.info(`${fullTag} Epoch start set to : `, this.epochStart.toISOString());
        }
        else {
            configLogger().configLog.warn(`No valid epochStart date provided in feedConfig [${feedConfigAlias}] ... will use January 1st 1970`);
        }

        const addFeedHubEndpoint = () => {
            //  NOTE
            //          this piece of code is largely inspired by the equivalent FeedHub functionality with
            //          backendServer except in FeedHub the .netFlavor.backendServer is mandatory whereas
            //          .netFlavor.feedHubServer is not mandatory for now in feedCore.
            //          Plus feed feedHubEndpoint may diverge from original feedHubServer due to a different
            //          credential alias.
            const { _invalidFeedHubServerMsgs, _invalidCredentialsMsgs, netFlavorAlias,
                    feedHubServers, allCredentials, configFQN } = config;

            //  fallback config.netFlavor.feedHubServer already verified present in feedHubServers, if defined, but not mandatory for now.
            const feedHubServerAlias = ownFeedHubServerAlias || config.feedHubServerAlias;

            if ( !feedHubServerAlias ) {
                _invalidFeedHubServerMsgs.push(`Neither .feedConfigs[${feedConfigAlias}].feedHubServer [${
                                ownFeedHubServerAlias}], nor .netFlavors[${netFlavorAlias}].feedHubServer [${
                                config.feedHubServerAlias}] is a valid feedHubServer alias string, in config file [${
                                configFQN}].`);
            } // return undefined;
            else {
                Object.defineProperty(this, '_feedHubServerAlias', {configurable: true, value: feedHubServerAlias});
                const feedHubServer = feedHubServers && feedHubServers[feedHubServerAlias];
                if ( !feedHubServer ) {                     //  feed.feedHubServer undefined in feedHubServers
                    _invalidFeedHubServerMsgs.push(`.feedConfigs[${feedConfigAlias}].feedHubServer "${feedHubServerAlias
                                    }" definition not found in .feedHubServers {} section of config file [${configFQN}].`);
                } // return undefined;
                else {
                    Object.defineProperty(this, '_feedHubServer', {configurable: true, value: feedHubServer});
                    // return this._feedHubEndpointMapOb[feedHubServerAlias]  ||  this._newFeedHubEndpoint(feedHubServerAlias,
                    //     feedHubServer);

                    let overriddenFeedHubCredentials, originalFeedHubCredentials;

                    if ('string' === typeof ownFeedHubCredentialsAlias) {
                        if (ownFeedHubCredentialsAlias === config.feedHubServerAlias) {
                            const sharedFeedHubEndpoint = config.originalFeedHubEndpointsByAlias[feedHubServerAlias];
                            if (sharedFeedHubEndpoint) {    //  with credentials already validated.
                                return sharedFeedHubEndpoint;
                            }
                        }
                        overriddenFeedHubCredentials = allCredentials[ownFeedHubCredentialsAlias];
                        if(undefined === overriddenFeedHubCredentials) {
                            _invalidCredentialsMsgs.push(`.feedConfigs[${feedConfigAlias}].feedHubCredentials: "${ownFeedHubCredentialsAlias
                                    }" definition not found in .credentials {} section of config file [${configFQN}].`);
                        }
                    }
                    else {
                        const sharedFeedHubEndpoint = config.originalFeedHubEndpointsByAlias[feedHubServerAlias];
                        if (sharedFeedHubEndpoint) {    //  with credentials already validated.
                            return sharedFeedHubEndpoint;
                        }
                        const { credentials:feedHubCredentialsAlias, scheme } = feedHubServer;
                        if ('string' === typeof feedHubCredentialsAlias ) {
                            originalFeedHubCredentials = allCredentials[feedHubCredentialsAlias];
                            if(undefined === originalFeedHubCredentials) {
                                _invalidCredentialsMsgs.push(`For .feedConfigs[${feedConfigAlias}].feedHubServer "${feedHubServerAlias
                                    }", .feedHubServers[${feedHubServerAlias}].credentials: "${feedHubCredentialsAlias
                                    }" definition is NOT found in .credentials {} section of config file [${configFQN}].`);
                            }

                        }
                        else if (scheme === "https") {
                            _invalidCredentialsMsgs.push(`For .feedConfigs[${feedConfigAlias}].feedHubServer "${
                                                        feedHubServerAlias}" with feedHubServer.scheme "${scheme
                                }", either its own default feedHubServer.credentials, or feedConfigs[${feedConfigAlias
                                }] .feedHubCredentials MUST specify an entry of the .credentials {} section of config file [${
                                configFQN}].`);
                        }
                    }

                    if (overriddenFeedHubCredentials) {
                        //  When feedHubServer .credentials has been overridden at the feed level with
                        //  .feedConfig.feedHubCredentials, the shared feedHubEndpoint with the original
                        //  feedHubServer config CANNOT be used directly.  A new unique feedHubEndpoint
                        //  is created for the feed, by copying the original feedHubServer config and
                        //  overriding its .credentials property with the feed ownFeedHubCredentialsAlias.
                        return  config._newFeedHubEndpoint( Object.assign({}, feedHubServer,
                                                                    {credentials:ownFeedHubCredentialsAlias}),
                                                            overriddenFeedHubCredentials );
                    }
                    else if (originalFeedHubCredentials) {
                        return config._newSharedFeedHubEndpoint(feedHubServerAlias, feedHubServer, originalFeedHubCredentials);
                    }
                //  else return undefined;
                }
            }
        };

        const feedHubEndpoint = addFeedHubEndpoint();
        if (feedHubEndpoint) {
            Object.defineProperty(this, '_feedHubEndpoint', {configurable:true, value:feedHubEndpoint});
        }

        Object.defineProperty(this, '_sapi', { configurable: true, value: null });
        Object.defineProperty(this, "_feedHubWeb", { configurable:true, value: null});
        Object.defineProperty(this, "_state",  { configurable:true, value: EState.booting});  //  non-enumerable
    }
    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }

    //region Feed extension utilities

    static get Feeds() { return Feeds; }                                                //  candidate for overriding
    get Feeds() { return Feeds; }                       //  e.g. Dispensaries           //  candidate for overriding

    static get Feed() { return this; }                                      //  "this" is the static This / constructor
    static get Feedsname() { return this.Feeds.Name; }                      //  "this" is the static This / constructor
    static get feedsname() { return _name(this.Feeds); }                    //  "this" is the static This / constructor
    static get Feedname() { return this.Name; }                             //  "this" is the static This / constructor
    static get feedname() { return _name(this); }                           //  "this" is the static This / constructor
    static get feedIdName() { return this.feedname+'Id'; }      //  Legacy
    static get feedAliasName() { return this.feedname+'Alias'; }

    static get eFeedKind() { return undefined; }                                        //  overridden in config.feeds

    get Feed() { return this.constructor; }             //  e.g. Dispensary
    get Feedsname() { return this.Feeds.Name; }         //  e.g. "Dispensaries"
    get feedsname() { return _name(this.Feeds); }       //  e.g. "dispensaries"
    get Feedname() { return this.Name; }                //  e.g. "Dispensary"
    get feedname() { return _name(this.constructor); }  //  e.g. "dispensary"
    get feedIdName() { return this.feedname+'Id'; }     //  e.g. "dispensaryId"
    get feedAliasName() { return this.feedname+'Alias';}//  e.g. "dispensaryAlias"

    //endregion

    static Setup(eFeedKind) {                                               //  Cache it all at instance level.
        const This = this;                                                  //  "this" is the static This / constructor
        Object.defineProperty(This, 'Name', {value:This.Name});
        Object.defineProperty(This, 'Feed', {value:This.Feed});
        Object.defineProperty(This, 'Feeds', {value:This.Feeds});
        Object.defineProperty(This, 'Feedsname', {value:This.Feedsname});
        Object.defineProperty(This, 'feedsname', {value:This.feedsname});
        Object.defineProperty(This, 'Feedname', {value:This.Feedname});
        Object.defineProperty(This, 'feedname', {value:This.feedname});
        Object.defineProperty(This, 'feedIdName', {value:This.feedIdName});
        Object.defineProperty(This, 'feedAliasName', {value:This.feedAliasName});
        Object.defineProperty(This, 'eFeedKind', {value:eFeedKind});
        FeedByFeedKind[eFeedKind] = This;

        const ThisProto = This.prototype;
        Object.defineProperty(ThisProto, 'Name', {value:This.Name});
        Object.defineProperty(ThisProto, 'name', {value:_name(This.Feed)});
        Object.defineProperty(ThisProto, 'Feed', {value:This.Feed});
        Object.defineProperty(ThisProto, 'Feeds', {value:This.Feeds});
        Object.defineProperty(ThisProto, 'Feedsname', {value:This.Feedsname});
        Object.defineProperty(ThisProto, 'feedsname', {value:This.feedsname});
        Object.defineProperty(ThisProto, 'Feedname', {value:This.Feedname});
        Object.defineProperty(ThisProto, 'feedname', {value:This.feedname});
        Object.defineProperty(ThisProto, 'feedIdName', {value:This.feedIdName});
        Object.defineProperty(ThisProto, 'feedAliasName', {value:This.feedAliasName});
        Object.defineProperty(ThisProto, 'eFeedKind', {value:eFeedKind});
        Object.defineProperty(ThisProto, `${this.feedname}Alias`, {get() { return this.alias; }});
    }

    get enabled() { return true; }
    /**
     *
     * @returns {string}
     */
    get alias() { return this._alias; }
    get feedConfigAlias()  {return this._feedConfigAlias; }
    get feedHubServerAlias() { return this._feedHubServerAlias; }
    get feedHubEndpoint() {return this._feedHubEndpoint; }
    get feedHubWeb() { return this._feedHubWeb; }
    get feedHubApi() { return this._feedHubApi; }

    get config() { return this._feeds._config; }
    get node() { return this._feeds._config._node; }
    get sapi() { return this._sapi; }
    get isBooting() { return EState.booting === this._state; }

    //  The feeds linking to this one
    get tag() { return `${this.alias}`; }
    get fullTag() { return `${this.Name} [${this.tag}]`; }

    bind() {
        const { feedHubEndpoint } = this;
        if (feedHubEndpoint) {
            Object.defineProperty(this, "_feedHubWeb", {configurable:true, value:feedHubEndpoint.bindWebRequestMethods()});

            /**
             *
             * @type {boolean}
             */
            const verbose = this.verbose;
            const feed = this;

            Object.defineProperty(this, '_feedHubApi', {value: {
                                                        //  N.B.:   New feedOps are built on every call to avoid races.
                    /**
                     *
                     * @return {function(srcPullParams: object): object}
                     */
                    get pullBackendPatientBundle() {
                        const pullBackendPatientBundleOp = new feedhubOps.PullBackendPatientBundle(feed, {}, {verbose});
                        const pullBackendPatientBundle =  async (srcPullParams) =>
                                            await (pullBackendPatientBundleOp.setupWith(srcPullParams)).pullFromSrc();

                        return  Object.defineProperty(pullBackendPatientBundle, '_feedOp', {value:pullBackendPatientBundleOp});
                    },

                    /**
                     *
                     * @return {function(srcPullParams: {}): object}
                     */
                    get pullBackendIdIssuersBundle() {
                        const pullBackendIdIssuersBundleOp = new feedhubOps.PullBackendIdIssuersBundle(feed, {}, {verbose});
                        const pullBackendIdIssuersBundle = async (srcPullParams={}) =>
                                            await (pullBackendIdIssuersBundleOp.setupWith(srcPullParams)).pullFromSrc();
                        return  Object.defineProperty(pullBackendIdIssuersBundle, '_feedOp', {value:pullBackendIdIssuersBundleOp});
                    },

                    /**
                     *
                     * @return {function({feedPatientId: string}): object}
                     */
                    get pullSingleBackendPatientReachability() {
                        const pullSingledBackendPatientReachabilityOp = new feedhubOps.PullSingledBackendPatientReachability(feed, {}, {verbose});
                        const pullSingledBackendPatientReachability = async ({feedPatientId:feedItemId}) =>
                                await (pullSingledBackendPatientReachabilityOp.setupWith({feedItemId})).pullFromSrc();

                        return  Object.defineProperty(pullSingledBackendPatientReachability, '_feedOp', {value:pullSingledBackendPatientReachabilityOp});
                    },

                    /**
                     *
                     * @return {function({feedItem:object, trackingId: string|undefined}): object}
                     */
                    get pushSinglePrivateMessageNotification() {
                        const pushSinglePrivateMessageNotificationOp = new feedhubOps.PushSinglePrivateMessageNotification(feed, {feedItem:undefined}, {verbose},);
                        const pushSinglePrivateMessageNotification = async ({feedItem, trackingId=undefined}) =>
                            await (pushSinglePrivateMessageNotificationOp.setupWith({feedItem, trackingId})).pushToDst();

                        return  Object.defineProperty(pushSinglePrivateMessageNotification, '_feedOp', {value:pushSinglePrivateMessageNotificationOp});
                    },
                }});
        }
    }

    async cacheJwt() {          // ensures credentials.jwt is a non-expired jwt, obtained from Feed if required
        try {
            const jwt = await this.feedHubWeb.cacheJwt();
            logger.info(`Starting ${this.fullTag} with endpoint jwt : ${jwt ? `${jwt.jwToken} ${jwt}` : null}`);
        } catch (e) { }
    }

    //region report
    statusReportRootsUp(rootsUp) { rootsUp.feed=this; return this._feeds.statusReportRootsUp(rootsUp); }
    statusReportRootsDown(dst, rootsUp) {
        const {pumps} = rootsUp, {id} = this;
        return pumps ? (dstDown => pumps.statusReportRootsDown(dstDown ? dstDown : (dst[id] = {}), rootsUp))(dst[id])
            : (dst[id] = rootsUp.result);
    }
    async reportStatus(dst) {
        const result = { status: this._state };
        // for (let ePumpDirection of EFlow) {
        //     result[ePumpDirection] = await this[ePumpDirection].reportStatus();
        // }
        if (dst) {
            (this.statusReportRootsUp({result}))(dst);
        }
        return result;
    }
    //endregion

    //region batching

    async _batch(stateOnSuccess, subAction=async () => {}) {
        try {
            await subAction();                                                      //  Do nothing for now.
            if (undefined !== stateOnSuccess)
                Object.defineProperty(this, "_state", {configurable:true, value:stateOnSuccess});
        }
        catch (e) {
            Object.defineProperty(this, "_state", {configurable:true, value:EState.error});
            throw e;
        }
    }

    async initialize(subAction=async ()=>{}) {
        logger.info(`Initializing [${this.tag}]`);
        Object.defineProperty(this, '_sapi', {value: new (require('../../lib/sapi').Provider)(this)});

        try {
            await this._batch(EState.stopped, subAction);                           //  Do nothing for now.
        }
        catch (e) {
            logger.error(`Error initializing ${this.fullTag}`, e);
            throw e;
        }
    }

    async start(subAction=async ()=>{}) {
        await this.cacheJwt();
        await this._batch(EState.running, subAction);                               //  Do nothing for now.
    }

    async stop(subAction=async ()=>{}) {
        if (this.isBooting) {
            throw ExpectedError(`${this.fullTag} in the process of booting. Not allowed to stop at this point. Retry later.`);
        }
        await this._batch(EState.stopped, subAction);
    }


    //endregion
}
self.Feed = Feed;

//endregion

logger.trace("Initialized ...");
