/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const self = module.exports;


const FeedOpsProto = {};
function FeedOps({sapiPullBundle, sapiPullSingle, sapiPushSingle, sapiAddSingle, sapiUpdateSingle, sapiRetireSingle, sapiSearch}={}) {
    const o = Object.create(FeedOpsProto);
    Object.assign(o,{sapiPullBundle, sapiPullSingle, sapiPushSingle,
                            sapiAddSingle, sapiUpdateSingle, sapiRetireSingle, sapiSearch});
    return o;
}
(self.FeedOps = FeedOps).chainProto();


class Provider {
    constructor(feed) {
        this.feed = feed;
        this.feedAlias = feed.alias;

        this.bindFeedOps();
    }
    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }

    get feedTag() { return this.feed.fullTag; }
    get verbose() { return this.feed.verbose; }

    static _PullBundles() { throw new Error("Provider._PullBundles() : Override me !"); }
    static _PullSingles() { throw new Error("Provider._PullSingles() : Override me !"); }
    static _PushSingles() { throw new Error("Provider._PushSingles() : Override me !"); }
    static _AddSingles() { throw new Error("Provider._AddSingles() : Override me !"); }
    static _UpdateSingles() { throw new Error("Provider._UpdateSingles() : Override me !"); }
    static _RetireSingles() { throw new Error("Provider._RetireSingles() : Override me !"); }
    static _Search() { throw new Error("Provider._Search() : Override me !"); }

    static _PullBackendBundles() { throw new Error("Provider._PullBackendBundles() : Override me !"); }
    static _PullBackendSingles() { throw new Error("Provider._PullBackendSingles() : Override me !"); }
    static _PushBackendSingles() { throw new Error("Provider._PushBackendSingles() : Override me !"); }

    bindFeedOps() {
        const { constructor:This, feed, feedTag } = this,
              { config:{feedProviderName}, verbose } = feed;
        /**
         *
         * @param {string} FeedItemName
         * @param {boolean|undefined} isApiSuccessVerbose
         * @param {function(feedProviderName:string, feedTag:string): string} fromToTags
         * @return {{isApiVerbose: boolean|undefined, FeedItemName: string, fromToTags: string}}
         */
        const feedOpValueProps = ({FeedItem:{FeedItemName, isApiSuccessVerbose,}}, fromToTags=(feedProviderName, feedTag)=>'') => ({
            FeedItemName,
            isApiSuccessVerbose,
            fromToTags: fromToTags(feedProviderName, feedTag)
        });

        for (let [sapi_pullBundle, FeedItem] of This._PullBundles()) {
            const { name } = sapi_pullBundle;
            const feedOp =  {[name]: function(srcParams) {                          //  this creates a named function
                                                            return FeedItem.DaoPullBundle(srcParams, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `from ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_pullSingle, FeedItem] of This._PullSingles()) {
            const { name } = sapi_pullSingle;
            const feedOp =  {[name]: function(params) {                             //  this creates a named function
                                                            return FeedItem.DaoPullSingle(params, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `from ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_pushSingle, FeedItem] of This._PushSingles()) {
            const { name } = sapi_pushSingle;
            const feedOp =  {[name]: function(srcLitOb) {                          //  this creates a named function
                                                            return FeedItem.DaoPushSingle(srcLitOb, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `to ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_addSingle, FeedItem] of This._AddSingles()) {
            const { name } = sapi_addSingle;
            const feedOp =  {[name]: function(srcLitOb) {                          //  this creates a named function
                                                            return FeedItem.DaoAddSingle(srcLitOb, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `to ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_updateSingle, FeedItem] of This._UpdateSingles()) {
            const { name } = sapi_updateSingle;
            const feedOp =  {[name]: function(srcLitOb) {                          //  this creates a named function
                                                            return FeedItem.DaoUpdateSingle(srcLitOb, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `of ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_addSingle, FeedItem] of This._RetireSingles()) {
            const { name } = sapi_addSingle;
            const feedOp =  {[name]: function(srcLitObFragment) {                   //  this creates a named function
                                                            return FeedItem.DaoRetireSingle(srcLitObFragment, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `from ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_search, FeedItem] of This._Search()) {
            const { name } = sapi_search;
            const feedOp =  {[name]: function(searchStr) {                          //  this creates a named function
                                                            return FeedItem.DaoSearch(searchStr, feed); },
                            }[name];
            this[name] = Object.assign(feedOp, feedOpValueProps({FeedItem}, (feedProviderName, feedTag) =>
                                                                                `from ${feedProviderName} ${feedTag}`));
        }

        for (let [sapi_pullBundle, feedhub_FeedPullBundle] of This._PullBackendBundles()) {
            const { name } = sapi_pullBundle;
            const { fromToTags, FeedItemName, isApiSuccessVerbose } = new feedhub_FeedPullBundle(feed, {}, {verbose});
            const feedOpCall =  {[name]: async function(srcPullParams) {                          //  this creates a named function
                    /**
                     * @type FeedPullBundle
                     */
                    const op =  new feedhub_FeedPullBundle(feed, {}, {verbose});
                    return await op.setupWith(srcPullParams).pullFromSrc(); },
            }[name];

            this[name] = Object.assign(feedOpCall, {fromToTags, FeedItemName, isApiSuccessVerbose });
        }

        for (let [sapi_pullSingle, feedhub_FeedPullSingle] of This._PullBackendSingles()) {
            const { name } = sapi_pullSingle;
            const { fromToTags, FeedItemName, isApiSuccessVerbose } = new feedhub_FeedPullSingle(feed, {}, {verbose});
            const feedOpCall =  {[name]: async function(params) {                          //  this creates a named function
                    /**
                     * @type FeedPullSingle
                     */
                    const op =  new feedhub_FeedPullSingle(feed, {}, {verbose});
                    return Object.defineProperty(await op.setupWith(params).pullFromSrc(),
                        '_feedItemId', {value: op.feedItemId}); },
            }[name];

            this[name] = Object.assign(feedOpCall, {fromToTags, FeedItemName, isApiSuccessVerbose });
        }

        for (let [sapi_pushSingle, feedhub_FeedPushSingle] of This._PushBackendSingles()) {
            const { name } = sapi_pushSingle;
            const { FeedItemName, fromToTags, isApiSuccessVerbose } = new feedhub_FeedPushSingle(feed, {}, {verbose});
            const feedOpCall =  {[name]: async function(srcLitOb) {                          //  this creates a named function
                    /**
                     * @type FeedPushSingle
                     */
                    const op =  new feedhub_FeedPushSingle(feed, {}, {verbose});
                    return Object.defineProperty(await op.setupWith({feedItem:srcLitOb}).pushToDst(),
                                                '_feedItemId', {value: op.feedItemId}); },
            }[name];

            this[name] = Object.assign(feedOpCall, {fromToTags, FeedItemName, isApiSuccessVerbose });
        }

    }

    pingFeedHub() { throw new Error(`Provider.prototype.pingFeedHub() : Override me !`); }
    pingBackend() { throw new Error(`Provider.prototype.pingBackend() : Override me !`); }

    //region Practitioner

    /**
     *
     * @returns {FeedOps}
     */
    practitionerFeedOps() { return FeedOps({sapiPullBundle: this.pullPractitionerBundle,
                                            sapiPullSingle: this.pullSinglePractitioner,
                                            sapiAddSingle: this.addSinglePractitioner,
                                            sapiUpdateSingle: this.updateSinglePractitioner,
                                            sapiRetireSingle: this.retireSinglePractitioner,
                                            sapiSearch: this.searchPractitioner,
    }); }

    pullPractitionerBundle(/*srcParams*/) { throw new Error("Provider.prototype.pullPractitionerBundle : Override me !"); }
    pullSinglePractitioner(/*params*/) { throw new Error("Provider.prototype.pullSinglePractitioner : Override me !"); }
    addSinglePractitioner(/*srcLitOb*/) { throw new Error("Provider.prototype.addSinglePractitioner : Override me !"); }
    updateSinglePractitioner(/*srcLitOb*/) { throw new Error("Provider.prototype.updateSinglePractitioner : Override me !"); }
    retireSinglePractitioner(/*srcLitObFragment*/) { throw new Error("Provider.prototype.retireSinglePractitioner : Override me !"); }
    searchPractitioner(/*searchStr*/) { throw new Error("Provider.prototype.searchPractitioner : Override me !"); }

    //endregion

    //region Patient

    /**
     *
     * @returns {FeedOps}
     */
    patientFeedOps() { return FeedOps({ sapiPullBundle: this.pullPatientBundle,
                                        sapiPullSingle: this.pullSinglePatient,
                                        sapiAddSingle: this.addSinglePatient,
                                        sapiUpdateSingle: this.updateSinglePatient,
                                        sapiRetireSingle: this.retireSinglePatient,
                                        sapiSearch: this.searchPatient,
    }); }

    pullPatientBundle(/*srcParams*/) { throw new Error("Provider.prototype.pullPatientBundle : Override me !"); }
    pullSinglePatient(/*params*/) { throw new Error("Provider.prototype.pullSinglePatient : Override me !"); }
    addSinglePatient(/*srcLitOb*/) { throw new Error("Provider.prototype.addSinglePatient : Override me !"); }
    updateSinglePatient(/*srcLitOb*/) { throw new Error("Provider.prototype.updateSinglePatient : Override me !"); }
    retireSinglePatient(/*srcLitObFragment*/) { throw new Error("Provider.prototype.retireSinglePatient : Override me !"); }
    searchPatient(/*searchStr*/) { throw new Error("Provider.prototype.searchPatient : Override me !"); }

    //endregion

    //region PatientReachability

    /**
     *
     * @returns {FeedOps}
     */
    patientReachabilityFeedOps() { return FeedOps({
        sapiPushSingle: this.pushSinglePatientReachability,
    }); }

    pushSinglePatientReachability(/*srcLitOb*/) { throw new Error("Provider.prototype.pushSinglePatientReachability : Override me !"); }

    //endregion

    //region PrivateMessageStatus

    /**
     *
     * @returns {FeedOps}
     */
    privateMessageStatusFeedOps() { return FeedOps({
        sapiPushSingle: this.pushSinglePrivateMessageStatus,
    }); }

    pushSinglePrivateMessageStatus(/*srcLitOb*/) { throw new Error("Provider.prototype.pushSinglePrivateMessageStatus : Override me !"); }

    //endregion

    //region PrivateMessage

    /**
     *
     * @returns {FeedOps}
     */
    privateMessageFeedOps() { return FeedOps({ // sapiPullBundle: this.pullPatientBundle,
                                        sapiPullSingle: this.pullSinglePrivateMessageContent,
                                        // sapiAddSingle: this.addSinglePatient,
                                        // sapiUpdateSingle: this.updateSinglePatient,
                                        // sapiRetireSingle: this.retireSinglePatient,
                                        // sapiSearch: this.searchPatient,
    }); }

    pullSinglePrivateMessageContent(/*params*/) { throw new Error("Provider.prototype.pullSinglePrivateMessageContent : Override me !"); }

    //endregion

    //region Appointment

     /**
     *
     * @returns {FeedOps}
     */
    appointmentFeedOps() { return FeedOps({ sapiPullBundle: this.pullAppointmentBundle,
                                            sapiPullSingle: this.pullSingleAppointment,
    }); }

    pullAppointmentBundle(/*srcParams*/) { throw new Error("Provider.prototype.pullAppointmentBundle : Override me !"); }
    pullSingleAppointment(/*params*/) { throw new Error("Provider.prototype.pullSingleAppointment : Override me !"); }

    //endregion

    //region RdvDisposition

    /**
     *
     * @returns {FeedOps}
     */
    rdvDispositionFeedOps() { return FeedOps({
        sapiPushSingle: this.pushSingleRdvDisposition,
    }); }

    pushSingleRdvDisposition(/*srcLitOb*/) { throw new Error("Provider.prototype.pushSingleRdvDisposition : Override me !"); }

    //endregion

    //region Backend ops

    pullBackendIdIssuersBundle(/*srcParams*/) { throw new Error("Provider.prototype.pullBackendIdIssuersBundle : Override me !"); }
    pullBackendPatientBundle(/*srcParams*/) { throw new Error("Provider.prototype.pullBackendPatientBundle : Override me !"); }


    pullSingleBackendPatientReachability(/*params*/) { throw new Error("Provider.prototype.pullSingleBackendPatientReachability : Override me !"); }


    pushSinglePrivateMessageNotification(/*srcLitOb*/) { throw new Error("Provider.prototype.pushSinglePrivateMessageNotification : Override me !"); }


    backendIdIssuersFeedOps() { return FeedOps({
        sapiPullBundle: this.pullBackendIdIssuersBundle,
    }); }
    backendPatientFeedOps() { return FeedOps({
        sapiPullBundle: this.pullBackendPatientBundle,
    }); }
    backendPatientReachabilityFeedOps() { return FeedOps({
        sapiPullSingle: this.pullSingleBackendPatientReachability,
    }); }
    backendPrivateMessageNotificationFeedOps() { return FeedOps({
        sapiPushSingle: this.pushSinglePrivateMessageNotification,
    }); }


    //endregion

}
self.Provider = Provider;

logger.trace("Initialized ...");
