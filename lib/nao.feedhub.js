/**
 *
 * © Copyright Portable EHR inc, 2020
 *
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger      = require('log4js').getLogger(fileTag);

const { niceJSON } = require('../../nodeCore/lib/utils.js');
const { feedHubServer } = require('../../lib/node').config;
const { Post:feedHubServerPost, Get: feedHubServerGet} = feedHubServer.web;

const { FeedHubApiResponse, } = require('../../nodeCore/lib/api');
const { eFlowsToBackend, Unpacking, FeedHubError, FeedOp,
        expectedErrorTransportStatus, expectedBackendErrorMaintenanceStatus } = require('./feed.core');

const self = module.exports;

Object.assign(self, {expectedErrorTransportStatus, expectedBackendErrorMaintenanceStatus});     //  Own these.

class FeedHubOp extends FeedOp {get tag(){return `PostToFeedHub`;} get isToFeed(){return false;} get isOfFeed(){return false;}}
const no=false, feedOp = new (FeedHubOp.SetupBackend(FeedHubOp.prototype, eFlowsToBackend, no))(feedHubServer); //  Todo: complete transformation backend -> feedHub

const performFeedHubPost = self.performFeedHubPost = async ({path, body:{feedAlias, command, parameters, trackingId = undefined, ...restOfBody
                                                        }={}}, {verbose=undefined, ...timeoutInMs_maxAttempts_extraOptions}={}) => {
    try {
        const {body, statusCode2XX:statusCode, msgHead} = await feedHubServerPost({path, postBody:{ feedAlias,
                command, parameters, trackingId, ...restOfBody}}, {verbose, ...timeoutInMs_maxAttempts_extraOptions});
        let feedHubError;
        try {
            const jsOb = JSON.parse(body);
            // return FeedHubApiResponse(jsOb);
            const feedHubApiResponse = FeedHubApiResponse(jsOb);
            if (feedHubApiResponse.isStatusOk) {
                return feedHubApiResponse;
            }
            feedHubError = FeedHubError({msgHead, statusCode, ...feedHubApiResponse});
        }
        catch (e) {
            throw Unpacking(e, msgHead, `Error parsing JSON body in performFeedHubPost with body : { command : ${
                    command}, parameters : ${niceJSON(parameters)}, trackingId : ${trackingId} }\n`,
                `HTTP statusCode [${statusCode}] and unexpected ${!body ? 'empty ' : ''}json body.`, body);
        }
        throw feedHubError
    }
    catch (e) {
        throw Object.assign(e, {feedOp});
    }
};

const performFeedHubGet = self.performFeedHubGet = async ({path, params, requiresJwt},
                                                {verbose=undefined, ...timeoutInMs_maxAttempts_extraOptions}={}) => {
    try {
        const {body /*, statusCode2XX:statusCode, msgHead*/} = await feedHubServerGet({path, params, requiresJwt}, {verbose, ...timeoutInMs_maxAttempts_extraOptions});
        return body;
    }
    catch (e) {
        throw Object.assign(e, {feedOp});
    }
};

self.pingFeedHubServer = async (options={verbose:false}) => await performFeedHubGet({path:'/node/ping', requiresJwt:false}, options);

self.reportWtf = async (wtf, verbose) => await performFeedHubPost({path:'/node/wtf',
                                                                body:{ command:'report', parameters: wtf}}, {verbose});

self.runFeedHubServerUnitTest = async (dispensaryId, verbose=false, timeOutInMs=1000 * 36) => {
    //  Test all known Backend/feed route + command
    const feedHubPost = async (path, body, verbose = false, timeOutInMs) => {
        const {command, parameters} = body;
        logger.info(`runFeedHubServerUnitTest : performFeedHubPostRequest('${path}', command: '${command
                    }', parameters: ${JSON.stringify(parameters)}) responded :\n${
                                        await performFeedHubPost({path, body}, {verbose, timeOutInMs})}`);
    };

    // if ( 0 ) {
    //     const {ERdvLocation:{clinic:eRdvLocationClinic}, ERdvConfirmationStatus} = require('./feed.backend.ops');
    //     await feedHubPost('/ehr/feed/appointment', {
    //             command: 'schedule',
    //             parameters: {
    //                 // id:             typeof id === 'number'  ?  `${id}` :  id,       // convert received int to string
    //                 // patientId:      typeof patientId === 'number'  ?  `${patientId}` :  patientId,
    //                 // dispensaryId,
    //                 // practitionerId: typeof practitionerId === 'number'  ?  `${practitionerId}` :  practitionerId,
    //                 location: `${eRdvLocationClinic}`,
    //                 // "with":name,
    //                 // description,
    //                 // lastUpdated,
    //                 // startTime,
    //                 // endTime,
    //                 // notes,
    //                 confirmationStatus:`${ERdvConfirmationStatus[/*rdvStatus*/'pending']}`,
    //                 patientMustConfirm:true,
    //             }
    //         }, verbose, timeOutInMs);
    // }
    // if ( 1 ) {
    //     await feedHubPost('/ehr/feed/patient/reachability', {
    //             command: 'query',
    //             parameters: {patientId: ["29", "23095"][ 1 ], dispensaryId}
    //         },  verbose, timeOutInMs);
    // }
    //
    // if ( 1 ) {
    //     await feedHubPost('/ehr/feed/patient/reachability', {
    //             command: 'pullBundle',
    //             parameters: {
    //                 dispensaryId,
    //                 since       : new Date(`2019-08-01`),
    //                 offset      : 1,
    //                 maxItems    : 4,
    //             }}, verbose, timeOutInMs);
    // }
    // if ( 1 ) {
    //     await feedHubPost('/ehr/feed/privateMessage', {
    //             command: 'status',
    //             parameters: {
    //                 dispensaryId,
    //                 since       : new Date(`2019-08-01`),
    //             }}, verbose, timeOutInMs);
    // }
};

logger.trace("Initialized ...");
