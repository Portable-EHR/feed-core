/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';

const { Endpoint } = require('../../nodeCore/lib/config.nao');
const { FeedHubWebRequestMethods} = require('../../nodeCore/lib/nao');
const { NodeConfig:nodeCore_NodeConfig, WtfConfig, epoch, nodeConfig } = require('../../nodeCore/lib/config');

const self = module.exports;

self.nodeConfig = nodeConfig;   //  Own it! from nodeCore/lib

const cFeedProvider = 'DsePortable';

class NodeConfig extends nodeCore_NodeConfig {

    constructor(srcJsOb, node) {
        super(srcJsOb, node);
        const configLogger = () => this._configLogger;      //  Will return undefined after config time!
        const { feedFlavor:feedFlavorAlias, allCredentials } = this;

        const { feedHubServers, feedFlavors, feedConfigs } = srcJsOb;
        Object.assign(this, { feedHubServers, feedFlavors, feedConfigs });

        const { configFQN } = node.launchParams;

        //region feedConfig

        const feedConfigAlias =  feedFlavors[feedFlavorAlias];
        if (undefined === feedConfigAlias) {
            configLogger().bailOut(`launchParam (f)eedFlavor "${feedFlavorAlias}" definition not found in .feedFlavors {} section of config file [${configFQN}].`);
        }
        Object.defineProperty(this, '_feedConfig',  {value: feedConfigAlias});
        Object.defineProperty(this, '_allFeedsByAlias', {value:{} });

        //  For now, there's one feedConfig per feedFlavor; multiple feedConfig per feedFlavor is foreseeable.

        const feedConfig = this.feedConfigs[feedConfigAlias];
        if (undefined === feedConfig) {
            configLogger().bailOut(`feedConfig "${feedConfigAlias}" definition not found in .feedConfigs {} section of config file [${node.launchParams.configFQN}].`);
        }

        const { feedAlias, comment, verbose, epochStart, wtf,
                feedHubServer:feedHubServerAlias, feedHubCredentials:feedHubCredentialsAlias } = feedConfig;
        Object.defineProperty(this, '_feedAlias', {value: feedAlias ? feedAlias : feedConfigAlias});

        const proto = this.constructor.prototype;
        const nodeNameAlias = `${node.nodeName}Alias`;
        if ( ! proto[nodeNameAlias]) {
            Object.defineProperty(proto, nodeNameAlias, {configurable:true, get() { return this.feedAlias; }});
        }

        Object.defineProperty(this, '_epochStart', {value: epochStart ? new Date(epochStart) : epoch()});
        if (epochStart)     configLogger().configLog.info(`Epoch start set to : `, this.epochStart.toISOString());
        else    configLogger().configLog.warn(`No epochStart provided in feedConfig [${feedConfigAlias}] ... will use January 1st 1970`);

        Object.defineProperty(this, '_comment',         {value: comment});
        Object.defineProperty(this, '_verbose',         {value: verbose});
        Object.defineProperty(this, '_wtf',         {value: WtfConfig(wtf)});


        const feedHubServer = feedHubServers[feedHubServerAlias];
        if (undefined === feedHubServer) {
            configLogger().bailOut(`feedConfig [${feedConfigAlias}] .feedHubServer: "${feedHubServerAlias}" definition not found in .feedHubServers {} section of config file [${configFQN}].`);
        }
        const { credentials:feedHubDfltCredentialsAlias, scheme } = feedHubServer;
        let feedHubCredentials;
        if ('string' === typeof feedHubCredentialsAlias) {
            feedHubCredentials = allCredentials[feedHubCredentialsAlias];
            if(undefined === feedHubCredentials) {
                configLogger().bailOut(`feedConfig [${feedConfigAlias}] .feedHubCredentials: "${feedHubCredentialsAlias}" definition not found in .credentials {} section of config file [${configFQN}].`);
            }
        }
        else if ('string' === typeof feedHubDfltCredentialsAlias ) {
            feedHubCredentials = allCredentials[feedHubDfltCredentialsAlias];
            if(undefined === feedHubCredentials) {
                configLogger().bailOut(`feedConfig [${feedConfigAlias}] .feedHubServer [${feedHubServerAlias}] .credentials: "${feedHubDfltCredentialsAlias}" definition not found in .credentials {} section of config file [${configFQN}].`);
            }

        }
        else if (scheme === "https") {
            configLogger().bailOut(`For feedConfig [${feedConfigAlias}] .feedHubServer [${feedHubServerAlias}] .scheme "${scheme}", either its own default feedHubServer.credentials, or feedConfig [${feedConfigAlias}] .feedHubCredentials MUST specify an entry of the .credentials {} section of config file [${configFQN}].`);
        }
        const endpointParams = feedHubCredentials ? Object.assign({}, feedHubServer, {credentials:feedHubCredentialsAlias})
                                                  : feedHubServer;
        Object.defineProperty(this, '_feedHubServer',  {value: new Endpoint(endpointParams,  this, endpoint => FeedHubWebRequestMethods(endpoint), false)});
        //  Bind endpoint ._credentials right away.
        Object.defineProperty(this.feedHubServer, "_credentials", {value: feedHubCredentials});
    }

    // region feedConfig

    get allFeedsByAlias()   { return this._allFeedsByAlias; }
    get feedConfig()        { return this._feedConfig; }
    get feedAlias()         { return this._feedAlias; }
    get comment()       { return this._comment; }
    get verbose()       { return this._verbose; }
    get epochStart()    { return this._epochStart; }
    get wtf()           { return this._wtf; }
    get feedHubServer() { return this._feedHubServer; }
    get feedProvider()  { return {name:cFeedProvider}; }

    //endregion
}
self.NodeConfig = NodeConfig;

