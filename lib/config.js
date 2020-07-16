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
        const { feedFlavor:feedFlavorId, allCredentials } = this;

        const { feedHubServers, feedFlavors, feedConfigs } = srcJsOb;
        Object.assign(this, { feedHubServers, feedFlavors, feedConfigs });

        const { configFQN } = node.launchParams;

        //region feedConfig

        const feedConfigId =  feedFlavors[feedFlavorId];
        if (undefined === feedConfigId) {
            configLogger().bailOut(`launchParam (f)eedFlavor "${feedFlavorId}" definition not found in .feedFlavors {} section of config file [${configFQN}].`);
        }
        Object.defineProperty(this, '_feedConfig',  {value: feedConfigId});
        Object.defineProperty(this, '_allFeedsById', {value:{} });

        //  For now, there's one feedConfig per feedFlavor; multiple feedConfig per feedFlavor is foreseeable.

        const feedConfig = this.feedConfigs[feedConfigId];
        if (undefined === feedConfig) {
            configLogger().bailOut(`feedConfig "${feedConfigId}" definition not found in .feedConfigs {} section of config file [${node.launchParams.configFQN}].`);
        }

        const { feedId, comment, verbose, epochStart, wtf,
                feedHubServer:feedHubServerId, feedHubCredentials:feedHubCredentialsId } = feedConfig;
        Object.defineProperty(this, '_feedId', {value: feedId ? feedId : feedConfigId});

        const proto = this.constructor.prototype;
        const nodeNameId = `${node.nodeName}Id`;
        if ( ! proto[nodeNameId]) {
            Object.defineProperty(proto, nodeNameId, {configurable:true, get() { return this.feedId; }});
        }

        Object.defineProperty(this, '_epochStart', {value: epochStart ? new Date(epochStart) : epoch()});
        if (epochStart)     configLogger().configLog.info(`Epoch start set to : `, this.epochStart.toISOString());
        else    configLogger().configLog.warn(`No epochStart provided in feedConfig [${feedConfigId}] ... will use January 1st 1970`);

        Object.defineProperty(this, '_comment',         {value: comment});
        Object.defineProperty(this, '_verbose',         {value: verbose});
        Object.defineProperty(this, '_wtf',         {value: WtfConfig(wtf)});


        const feedHubServer = feedHubServers[feedHubServerId];
        if (undefined === feedHubServer) {
            configLogger().bailOut(`feedConfig [${feedConfigId}] .feedHubServer: "${feedHubServerId}" definition not found in .feedHubServers {} section of config file [${configFQN}].`);
        }
        const { credentials:feedHubDfltCredentialsId, scheme } = feedHubServer;
        let feedHubCredentials;
        if ('string' === typeof feedHubCredentialsId) {
            feedHubCredentials = allCredentials[feedHubCredentialsId];
            if(undefined === feedHubCredentials) {
                configLogger().bailOut(`feedConfig [${feedConfigId}] .feedHubCredentials: "${feedHubCredentialsId}" definition not found in .credentials {} section of config file [${configFQN}].`);
            }
        }
        else if ('string' === typeof feedHubDfltCredentialsId ) {
            feedHubCredentials = allCredentials[feedHubDfltCredentialsId];
            if(undefined === feedHubCredentials) {
                configLogger().bailOut(`feedConfig [${feedConfigId}] .feedHubServer [${feedHubServerId}] .credentials: "${feedHubDfltCredentialsId}" definition not found in .credentials {} section of config file [${configFQN}].`);
            }

        }
        else if (scheme === "https") {
            configLogger().bailOut(`For feedConfig [${feedConfigId}] .feedHubServer [${feedHubServerId}] .scheme "${scheme}", either its own default feedHubServer.credentials, or feedConfig [${feedConfigId}] .feedHubCredentials MUST specify an entry of the .credentials {} section of config file [${configFQN}].`);
        }
        const endpointParams = feedHubCredentials ? Object.assign({}, feedHubServer, {credentials:feedHubCredentialsId})
                                                  : feedHubServer;
        Object.defineProperty(this, '_feedHubServer',  {value: new Endpoint(endpointParams,  this, endpoint => FeedHubWebRequestMethods(endpoint), false)});
        //  Bind endpoint ._credentials right away.
        Object.defineProperty(this.feedHubServer, "_credentials", {value: feedHubCredentials});
    }

    // region feedConfig

    get allFeedsById()  { return this._allFeedsById; }
    get feedConfig()    { return this._feedConfig; }
    get feedId()        { return this._feedId; }
    get comment()       { return this._comment; }
    get verbose()       { return this._verbose; }
    get epochStart()    { return this._epochStart; }
    get wtf()           { return this._wtf; }
    get feedHubServer() { return this._feedHubServer; }
    get feedProvider()  { return {name:cFeedProvider}; }

    //endregion
}
self.NodeConfig = NodeConfig;

