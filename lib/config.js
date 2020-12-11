/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';

const { niceJSON } = require('../../nodeCore/lib/utils');
const { Endpoint } = require('../../nodeCore/lib/config.nao');
const { FeedHubWebRequestMethods} = require('../../nodeCore/lib/nao');
const { NodeConfig:nodeCore_NodeConfig, nodeConfig } = require('../../nodeCore/lib/config');

const self = module.exports;

self.nodeConfig = nodeConfig;   //  Own it! from nodeCore/lib

const cFeedProvider = 'DsePortable';

class NodeConfig extends nodeCore_NodeConfig {

    constructor(srcJsOb, node) {
        super(srcJsOb, node);
        const configLogger = () => this._configLogger;      //  Will return undefined after config time!
        const { netFlavorAlias, feedFlavorAlias, allCredentials, configFQN } = this;

        const { feedHubServers, feedFlavors, feedConfigs } = srcJsOb;
        Object.assign(this, { feedHubServers, feedFlavors, feedConfigs });
        //  it says "original" because there can be "modified" per-feed versions with a different credentials alias.
        Object.defineProperty(this, '_originalFeedHubEndpointsByAlias', {value:{}});

        const feedHubServerAlias = this.feedHubServerAlias;
                //  overrides proto._feedHubServerAlias
        Object.defineProperty(this, '_feedHubServerAlias', {configurable:true, value: feedHubServerAlias});

        const feedHubServer = this.feedHubServer;
                //  overrides proto._feedHubServer
        Object.defineProperty(this, '_feedHubServer', {configurable:true, value: feedHubServer});
        if (feedHubServerAlias  &&  undefined === feedHubServer) {  //  netFlavor-level feedHubServer is not mandatory for now.
            configLogger().bailOut(`.netFlavors[${netFlavorAlias}].feedHubServer: "${feedHubServerAlias}" definition not found in .feedHubServers {} section of config file [${configFQN}].`);
        }
        else if (feedHubServer) {                               //  Validate credentials and add shared feedHub endpoint
            const { credentials:feedHubCredentialsAlias, scheme } = feedHubServer;
            if ('string' === typeof feedHubCredentialsAlias ) {
                const feedHubCredentials = allCredentials[feedHubCredentialsAlias];
                if(undefined === feedHubCredentials) {
                    configLogger().bailOut(`For .netFlavors[${netFlavorAlias}].feedHubServer "${
                                    feedHubServerAlias}", feedHubServer.credentials: "${feedHubCredentialsAlias
                                    }" definition not found in .credentials {} section of config file [${configFQN}].`);
                }
                else {
                    Object.defineProperty(this, '_feedHubEndpoint', {configurable:true, value:
                                this._newSharedFeedHubEndpoint(feedHubServerAlias, feedHubServer, feedHubCredentials)});
                    this.feedHubEndpoint.bindWebRequestMethods();
                }
            }
            else if (scheme === "https") {
                configLogger().bailOut(`Invalid feedHubServer.credentials [${feedHubCredentialsAlias}] for .netFlavors[${
                                        netFlavorAlias}].feedHubServer [${feedHubServerAlias}] with .scheme "${scheme
                                        }". It MUST specify an entry of the .credentials {} section of config file [${
                                        configFQN}].`);
            }
        }

        //region feedFlavor / feedConfig

        let feedFlavor = this.feedFlavor;                                           //  .feedFlavors[.feedFlavorAlias]
                    //  overrides proto._feedFlavor
        Object.defineProperty(this, '_feedFlavor', {configurable:true, value: feedFlavor});
        if (undefined === feedFlavor) {
            configLogger().bailOut(`launchParam (f)eedFlavor "${feedFlavorAlias}" definition not found in .feedFlavors {} section of config file [${configFQN}].`);
        }

        //  At this point, feedFlavor is either a feedConfigAlias or an array of feedConfigAliases

        Object.defineProperty(this, '_feedConfig',  {value: []});
        const { _allFeedsByAlias } =
            Object.defineProperty(this, '_allFeedsByAlias', {value:{} });
        const { _invalidFeedHubServerMsgs } =
            Object.defineProperty(this, '_invalidFeedHubServerMsgs', {configurable:true, value:[]});
        const { _invalidCredentialsMsgs } =
            Object.defineProperty(this, '_invalidCredentialsMsgs', {configurable:true, value:[]});

        if ('string' === typeof feedFlavor) {
            feedFlavor = [feedFlavor]
        }
        else if ( ! (feedFlavor instanceof Array)) {
            configLogger().bailOut(`Invalid .feedFlavors[${feedFlavorAlias}] definition : ${feedFlavor !== null  &&
                            'object' === typeof feedFlavor  ?  (niceJSON(feedFlavor) + ',\n')  :  `[${feedFlavor}], `
                            }found in config file [${configFQN
                            }] :\nIt MUST be a feedConfigAlias string or an array of feedConfigAlias strings.`);
        }

        //  At this point, feedFlavor is an array of one or more feedConfigAlias

        const   This = this.constructor,
              { Feed } = This,                  //  Currently, only one Feed Kind is defined by feed server instance.
              { Feeds, /*feedsname*/ } = Feed,  //  e.g. { Dispensaries, "dispensaries" } = Dispensary
                feeds = new Feeds(this),
            // _feedsname = '_'+feedsname,      //  e.g. _feedsname = "_dispensaries"
                feedConfigErrMsgs = [];

        //  e.g.    this._feeds = new Dispensaries();                       //  this._dispensaries = new Dispensaries();
        Object.defineProperty(this, '_feeds', {value: feeds});

        for (let feedConfigAlias of feedFlavor) {
            const feedConfig = this.feedConfigs[feedConfigAlias];
            if (undefined === feedConfig) {
                feedConfigErrMsgs.push(`.feedFlavors[${feedFlavorAlias}]: "${feedConfigAlias
                                    }" definition not found in .feedConfigs {} section of config file [${configFQN}].`);
            }
            else {
                const feed = feeds._addFeed(
                                            new Feed(feedConfig, feedConfigAlias, feeds)),
                      previousFeed = _allFeedsByAlias[feed.alias];

                if (undefined === previousFeed) {
                    _allFeedsByAlias[feed.alias] = feed;
                }
                else {
                    feedConfigErrMsgs.push(`.feedConfigs[${previousFeed.feedConfigAlias}] and .feedConfigs[${
                        feed.feedConfigAlias}] have the same .alias [${feed.alias
                        }]. Feed alias MUST be unique across all feeds in config file [${configFQN}].`);
                }
            }
        }

        if (_invalidFeedHubServerMsgs.length)   feedConfigErrMsgs.push(_invalidFeedHubServerMsgs.join('\n'));
        if (_invalidCredentialsMsgs.length)     feedConfigErrMsgs.push(_invalidCredentialsMsgs.join('\n'));
        if (feedConfigErrMsgs.length) configLogger().bailOut(feedConfigErrMsgs.join('\n'));
    }

    //region feedHub servers

    get _feedHubServerAlias() { return this.netFlavor.feedHubServer; }                                      //  overridden with instance value prop in constructor.
    get feedHubServerAlias() { return this._feedHubServerAlias; }

    get _feedHubServer() { return this.feedHubServers && this.feedHubServers[this._feedHubServerAlias]; }   //  overridden with instance value prop in constructor.
    get feedHubServer() { return this._feedHubServer; }

    get feedHubEndpoint() { return this._feedHubEndpoint; }

    _newFeedHubEndpoint(feedHubServer, credentials) {
        // noinspection JSCheckFunctionSignatures
        const endpoint = new Endpoint(feedHubServer, this, {kind: `FeedHub`, alias: this.feedHubServerAlias},
                        endpoint => FeedHubWebRequestMethods(endpoint),false);
        return Object.defineProperty(endpoint, '_credentials', {configurable:true, value: credentials});
    }
    _newSharedFeedHubEndpoint(feedHubServerAlias, feedHubServer, credentials) {
        // noinspection JSCheckFunctionSignatures
        return this._originalFeedHubEndpointsByAlias[feedHubServerAlias] = this._newFeedHubEndpoint(feedHubServer, credentials);
    }

    get originalFeedHubEndpointsByAlias() {return this._originalFeedHubEndpointsByAlias; }

    /**
     *
     * @returns {Feed}
     * @constructor
     */
    static get Feed() { throw Error(`${this.name}.get Feed() : Not defined yet. Override Me !`); }

    get _feedFlavor() { return this.feedFlavors && this.feedFlavors[this.feedFlavorAlias]; }    //  overridden with instance value prop in constructor.
    get feedFlavor()  { return this._feedFlavor; }

    get allFeedsByAlias()   { return this._allFeedsByAlias; }
    // get feedConfig()        { return this._feedConfig; }
    get feedProvider()  { return {name:cFeedProvider}; }
    get feeds() { return this._feeds; }

    //endregion
}
self.NodeConfig = NodeConfig;

