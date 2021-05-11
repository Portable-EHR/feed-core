/*
 * Copyright © Portable EHR inc, 2021
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { eFlowsToFeed, eFlowsToBackend, FeedPullSingle, FeedPullBundle, FeedBundleResponse, FeedPushSingle
        } = require('./feed.core.ops');

const self = module.exports;

//region BackendPatient

class BackendPatientBundleResponse extends FeedBundleResponse {
    static get NameOfFeedItem() { return `BackendPatient`; }
    static get eDirectionOfFeedItem() { return eFlowsToFeed; }
}
(self.BackendPatientBundleResponse = BackendPatientBundleResponse).Setup();

class PullBackendPatientBundle extends FeedPullBundle {
    static get path() { return `/backend/backendPatient`; }
    static get Criteria() { return this.Criterias.Slice; }              //  FeedHubCriterias from feed.core.ops
    static get ResponseClass() { return BackendPatientBundleResponse; }
}
(self.PullBackendPatientBundle = PullBackendPatientBundle).Setup();

//endregion


//region BackendIdIssuers

class BackendIdIssuersBundleResponse extends FeedBundleResponse {
    static get NameOfFeedItem() { return `BackendIdIssuers`; }
    static get eDirectionOfFeedItem() { return eFlowsToFeed; }
}
(self.BackendIdIssuersBundleResponse = BackendIdIssuersBundleResponse).Setup();

class PullBackendIdIssuersBundle extends FeedPullBundle {
    static get path() { return `/backend/idissuers`; }
    static get Criteria() { return this.Criterias.None; }              //  FeedHubCriterias from feed.core.ops
    static get ResponseClass() { return BackendIdIssuersBundleResponse; }
}
(self.PullBackendIdIssuersBundle = PullBackendIdIssuersBundle).Setup();

//endregion


//region BackendPatientReachability

class PullSingledBackendPatientReachability extends FeedPullSingle {
    static get NameOfFeedItem() { return `BackendPatientReachability`; }
    static get eDirectionOfFeedItem() { return eFlowsToFeed; }

    static get path() { return `/backend/patient/reachability`; }
    get feedhubRequestParameters() { return {patientId:this.feedItemId}; }
}
(self.PullSingledBackendPatientReachability = PullSingledBackendPatientReachability).Setup();

//endregion


//region PrivateMessageNotification

class PushSinglePrivateMessageNotification extends FeedPushSingle {
    static get NameOfFeedItem() { return `PrivateMessageNotification`; }
    static get eDirectionOfFeedItem() { return eFlowsToBackend; }

    static get path() { return `/backend/privateMessage/notification`; }
    static get getFeedItemId() { return function() { return this.feedItem.messageId; } }
}
(self.PushSinglePrivateMessageNotification = PushSinglePrivateMessageNotification).Setup();

//endregion

logger.trace("Initialized ...");
