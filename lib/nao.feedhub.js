/**
 *
 * © Copyright Portable EHR inc, 2020
 *
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger      = require('log4js').getLogger(fileTag);

const { niceJSON } = require('../../nodeCore/lib/utils.js');
const { config } = require('../../lib/node');
const { feedHubEndpoint:{web}={}, feedProviderName, Feed } = config,
        feedHubServerGet = web.Get;

const { FeedHubApiResponse, isFeedHubStatusOk } = require('../../nodeCore/lib/api');
const { eFlowsToFeed, Unpacking, FeedHubError, FeedOp } = require('./feed.core');

const self = module.exports;


class PostToFeedHub extends FeedOp {
    constructor(feed, path, command) {
        super(feed);
        Object.defineProperty(this, '_path',    {value:path});
        Object.defineProperty(this, 'command', {value:command});
    }

    async performPostToFeedHub({feedAlias, parameters, trackingId = undefined, ...restOfBody}={},
                                {verbose=undefined, ...timeoutInMs_maxAttempts_extraOptions}={}) {
        const { path, command } = this;
        return await this.endpoint.web.Post({path, postBody:{feedAlias, command, parameters, trackingId, ...restOfBody}},
                                            {verbose, ...timeoutInMs_maxAttempts_extraOptions});
    }

    get tag() { return `${this.Name} (${this.path}).${this.command}`; }
    get _errorMsg() { return `Failed performing ${this.tag} :`; }
    get feed() { return { fullTag:`${Feed.Name} [unspecified]`, feedHubEndpoint: config.feedHubEndpoint}}
    static get FeedProviderFullTag() { return `FeedProvider [${feedProviderName}] version []`; }

    static Setup({ eDirection=eFlowsToFeed, FeedItemName='unspecified' }={}) {  //  Default to some form of pull from FeedHub.
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
        This.SetupFeedHub(PostToFeedHub.prototype, { FeedItemName, eDirection });
    }
//  get isToFeed(){ return undefined; }     //  Stays undefined so FeedOp.prototype.get fromToTags() models to a pull()
}
(self.PostToFeedHub = PostToFeedHub).Setup();


/**
 *
 * @param {string} path
 * @param {string|undefined} feedAlias
 * @param {string} command
 * @param {object|string|undefined} parameters
 * @param {string|undefined} trackingId
 * @param {...object} restOfBody
 * @param {boolean|undefined} verbose
 * @param {...object} timeoutInMs_maxAttempts_extraOptions
 * @return {Promise<{requestStatus:({status:string, message:string}), responseContent:object}>}
 */
const performFeedHubPost = async ({path, body:{feedAlias, command, parameters, trackingId=undefined, ...restOfBody}={}},
                                                { verbose=undefined, ...timeoutInMs_maxAttempts_extraOptions}={}) => {
    const feed =  config.allFeedsByAlias[feedAlias];
    const feedOp = new PostToFeedHub(feed, path, command);
    try {

        const {body, statusCode2XX:statusCode, msgHead} = await feedOp.performPostToFeedHub(
                {feedAlias, parameters, trackingId, ...restOfBody}, {verbose, ...timeoutInMs_maxAttempts_extraOptions});
        let feedHubError;
        try {
            const {requestStatus, responseContent} = JSON.parse(body);
            if (isFeedHubStatusOk(requestStatus)) {
                return FeedHubApiResponse({...requestStatus, responseContent});
            }
            feedHubError = FeedHubError({msgHead, statusCode, requestStatus});
        }
        catch (e) {
            // noinspection ExceptionCaughtLocallyJS
            throw Unpacking(e, msgHead, `Error parsing JSON body in performFeedHubPost with body : { command : ${
                    command}, parameters : ${niceJSON(parameters)}, trackingId : ${trackingId} }\n`,
                `HTTP statusCode [${statusCode}] and unexpected ${!body ? 'empty ' : ''}json body.`, body);
        }
        // noinspection ExceptionCaughtLocallyJS
        throw feedHubError
    }
    catch (e) {
        throw Object.assign(e, {feedOp});
    }
};
self.performFeedHubPost = performFeedHubPost;

/**
 *
 * @param {string} path
 * @param {string|undefined} feedAlias
 * @param {object|undefined} params
 * @param {boolean} requiresJwt
 * @param {boolean|undefined} verbose
 * @param {...object} timeoutInMs_maxAttempts_extraOptions
 * @return {Promise<{body: string, statusCode2XX: number, msgHead: (function(): string)}|(function(): Promise<{body: string, statusCode2XX: number, msgHead: (function(): string)}>)>}
 */
const performFeedHubGet = async ({path, feedAlias, params, requiresJwt=true},
                                 {verbose=undefined, ...timeoutInMs_maxAttempts_extraOptions}={}) =>
    (async (feedHubServerGet) =>
                                (await feedHubServerGet(({path, params, requiresJwt}),
                                                        ({verbose, ...timeoutInMs_maxAttempts_extraOptions}))).body)
    ((feed  =>
                feed ? feed.feedHubEndpoint.web.Get : feedHubServerGet)
     (config.allFeedsByAlias[feedAlias]));
self.performFeedHubGet = performFeedHubGet;



self.pingFeedHubServer = async (options={verbose:false}, feedAlias) =>
                                    await performFeedHubGet({path:'/node/ping', feedAlias, requiresJwt:false}, options);

self.pingBackendServer = async (feedAlias, options={verbose:false}) =>
                                await performFeedHubPost({path:'/backend', body:{feedAlias, command:'ping'}}, options);

self.reportWtf = async (wtf, verbose) => await performFeedHubPost({path:'/node/wtf',
                                                                body:{ command:'report', parameters: wtf}}, {verbose});

// self.runFeedHubServerUnitTest = async (dispensaryId, verbose=false, timeOutInMs=1000 * 36) => {
//     //  Test all known Backend/feed route + command
//     const feedHubPost = async (path, body, verbose = false, timeOutInMs) => {
//         const {command, parameters} = body;
//         logger.info(`runFeedHubServerUnitTest : performFeedHubPostRequest('${path}', command: '${command
//                     }', parameters: ${JSON.stringify(parameters)}) responded :\n${
//                                         await performFeedHubPost({path, body}, {verbose, timeOutInMs})}`);
//     };
//
//     if ( 0 ) {
//         const {ERdvLocation:{clinic:eRdvLocationClinic}, ERdvConfirmationStatus} = require('./feed.backend.ops');
//         await feedHubPost('/ehr/feed/appointment', {
//                 command: 'schedule',
//                 parameters: {
//                     // id:             typeof id === 'number'  ?  `${id}` :  id,       // convert received int to string
//                     // patientId:      typeof patientId === 'number'  ?  `${patientId}` :  patientId,
//                     // dispensaryId,
//                     // practitionerId: typeof practitionerId === 'number'  ?  `${practitionerId}` :  practitionerId,
//                     location: `${eRdvLocationClinic}`,
//                     // "with":name,
//                     // description,
//                     // lastUpdated,
//                     // startTime,
//                     // endTime,
//                     // notes,
//                     confirmationStatus:`${ERdvConfirmationStatus[/*rdvStatus*/'pending']}`,
//                     patientMustConfirm:true,
//                 }
//             }, verbose, timeOutInMs);
//     }
//     if ( 1 ) {
//         await feedHubPost('/ehr/feed/patient/reachability', {
//                 command: 'query',
//                 parameters: {patientId: ["29", "23095"][ 1 ], dispensaryId}
//             },  verbose, timeOutInMs);
//     }
//
//     if ( 1 ) {
//         await feedHubPost('/ehr/feed/patient/reachability', {
//                 command: 'pullBundle',
//                 parameters: {
//                     dispensaryId,
//                     since       : new Date(`2019-08-01`),
//                     offset      : 1,
//                     maxItems    : 4,
//                 }}, verbose, timeOutInMs);
//     }
//     if ( 1 ) {
//         await feedHubPost('/ehr/feed/privateMessage', {
//                 command: 'status',
//                 parameters: {
//                     dispensaryId,
//                     since       : new Date(`2019-08-01`),
//                 }}, verbose, timeOutInMs);
//     }
// };

logger.trace("Initialized ...");
