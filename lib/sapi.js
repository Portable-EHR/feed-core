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
    get feedTag() { return this.feed.fullTag; }

    static _PullBundles() { throw new Error("Provider._PullBundles() : Override me !"); }
    static _PullSingles() { throw new Error("Provider._PullSingles() : Override me !"); }
    static _PushSingles() { throw new Error("Provider._PushSingles() : Override me !"); }
    static _AddSingles() { throw new Error("Provider._AddSingles() : Override me !"); }
    static _UpdateSingles() { throw new Error("Provider._UpdateSingles() : Override me !"); }
    static _RetireSingles() { throw new Error("Provider._RetireSingles() : Override me !"); }
    static _Search() { throw new Error("Provider._Search() : Override me !"); }

    bindFeedOps() {
        const { constructor:This, feed } = this;

        for (let [sapi_pullBundle, FeedItem] of This._PullBundles()) {
            const feedOp = srcParams => FeedItem.DaoPullBundle(srcParams, feed);
            feedOp.FeedItem = FeedItem;
            this[sapi_pullBundle.name] = feedOp;
        }

        for (let [sapi_pullSingle, FeedItem] of This._PullSingles()) {
            const feedOp = srcParams => FeedItem.DaoPullSingle(srcParams, feed);
            feedOp.FeedItem = FeedItem;
            this[sapi_pullSingle.name] = feedOp;
        }

        for (let [sapi_addSingle, FeedItem] of This._AddSingles()) {
            const feedOp = srcLitOb => FeedItem.DaoAddSingle(srcLitOb, feed);
            feedOp.FeedItem = FeedItem;
            this[sapi_addSingle.name] = feedOp;
        }

        for (let [sapi_addSingle, FeedItem] of This._RetireSingles()) {
            const feedOp = srcLitObFragment => FeedItem.DaoRetireSingle(srcLitObFragment, feed);
            feedOp.FeedItem = FeedItem;
            this[sapi_addSingle.name] = feedOp;
        }

        for (let [sapi_search, FeedItem] of This._Search()) {
            const feedOp = searchStr => FeedItem.DaoSearch(searchStr, feed);
            feedOp.FeedItem = FeedItem;
            this[sapi_search.name] = feedOp;
        }
    }

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

    pullPractitionerBundle(/*params*/) { throw new Error("Provider.pullPractitionerBundle : Override me !"); }
    pullSinglePractitioner(/*id*/) { throw new Error("Provider.pullSinglePractitioner : Override me !"); }
    addSinglePractitioner(/*params*/) { throw new Error("Provider.addSinglePractitioner : Override me !"); }
    updateSinglePractitioner(/*params*/) { throw new Error("Provider.updateSinglePractitioner : Override me !"); }
    retireSinglePractitioner(/*params*/) { throw new Error("Provider.retireSinglePractitioner : Override me !"); }
    searchPractitioner(/*params*/) { throw new Error("Provider.searchPractitioner : Override me !"); }

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

    pullPatientBundle(/*params*/) { throw new Error("Provider.pullPatientBundle : Override me !"); }
    pullSinglePatient(/*id*/) { throw new Error("Provider.pullSinglePatient : Override me !"); }
    addSinglePatient(/*params*/) { throw new Error("Provider.addSinglePatient : Override me !"); }
    updateSinglePatient(/*params*/) { throw new Error("Provider.updateSinglePatient : Override me !"); }
    retireSinglePatient(/*params*/) { throw new Error("Provider.retireSinglePatient : Override me !"); }
    searchPatient(/*params*/) { throw new Error("Provider.searchPatient : Override me !"); }

    //endregion


}
self.Provider = Provider;

logger.trace("Initialized ...");
