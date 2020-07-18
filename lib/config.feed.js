/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);
const { Enum, EItem, } = require('../../nodeCore/lib/utils');


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
[eDispensaryKind, eTeleClinic, ].join();   //  Kludge to prevent stupid 'unused' warnings.

//endregion

//region Feeds

const _name = constructor => (name => name.charAt(0).toLowerCase() + name.slice(1))(constructor.name);

class Feeds {

    constructor(feedJsOb, feedAlias, config) {
        Object.defineProperty(this, "_config", {value: config});
        const {Feed} = this;

        const feed = new Feed(feedJsOb, feedAlias, this);
        this[feedAlias] = feed;
        feed.bind();

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


    get enabled() { return this; }
    [Symbol.iterator]() { return Object.values(this)[Symbol.iterator](); }

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

    async initialize()  { await this._batch(FeedProto.initialize, EState.stopped); }

    async start()       { await this._batch(FeedProto.start, EState.running); }

    //endregion
}
self.Feeds = Feeds;

//endregion

//region Feed

class Feed {
    constructor(srcJsOb, alias, feeds) {
        Object.defineProperty(this, "_alias", {value: alias});  // default non-{writable|enumerable|configurable}
        Object.defineProperty(this, "_feeds", {value: feeds});

        //  epochStart and feedHubServer objects already built from srcJsOb in lib/config, just assign.
        const { comment, verbose, epochStart, wtf, feedHubServer } = srcJsOb;
        Object.assign(this, {comment, verbose, epochStart, wtf, feedHubServer});

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
    }

    /**
     *
     * @returns {string}
     */
    get alias() { return this._alias; }
    get feedAlias()  {return this._alias; }
    get feedHubWeb() { return this._feedHubWeb; }
    get config() { return this._feeds._config; }
    get node() { return this._feeds._config._node; }
    get sapi() { return this._sapi; }

    //  The feeds linking to this one
    get tag() { return `${this.alias}`; }
    get fullTag() { return `${this.Name} [${this.tag}]`; }

    bind() {
        Object.defineProperty(this, "_feedHubWeb", {configurable:true, value: this.feedHubServer.bindWebRequestMethods()});
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

    async _batch(subAction, stateOnSuccess) {
        try {
            subAction();                                                            //  Do nothing for now.
            if (undefined !== stateOnSuccess)
                Object.defineProperty(this, "_state", {configurable:true, value:stateOnSuccess});
        }
        catch (e) {
            Object.defineProperty(this, "_state", {configurable:true, value:EState.error});
            throw e;
        }
    }

    async initialize() {
        logger.info(`Initializing [${this.tag}]`);
        Object.defineProperty(this, '_sapi', {value: new (require('../../lib/sapi').Provider)(this)});

        try {
            await this._batch(()=>{}, EState.stopped);                     //  Do nothing for now.
        }
        catch (e) {
            logger.error(`Error initializing ${this.fullTag}`, e);
            throw e;
        }
    }

    async start() {
        await this.cacheJwt();
        await this._batch(()=>{}, EState.running);                         //  Do nothing for now.
    }

    //endregion
}
self.Feed = Feed;
const FeedProto = Feed.prototype;

//endregion

logger.trace("Initialized ...");
