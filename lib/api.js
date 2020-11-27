/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

//  For the time being, there's only one Feed supported per config file. So we can get it directly from lib/node.
//  When/if we support more than one, we'll have to extract the relevant one on each call.
const { config: {Feed} } = require('../../lib/node');
const { capitalizeName, niceJSON, html, dbMsg, } = require('../../nodeCore/lib/utils');
const { authorizeApiRequest, AuthError } = require('../../nodeCore/lib/api.auth');
const { FeedApiResponse, EFeedRequestStatus } = require('../../nodeCore/lib/api');
const {
    // OK:                     eFeedRequestStatusOk,
    INTERNAL:               eFeedRequestStatusInternal,
    INVALID_COMMAND:        eFeedRequestStatusInvalidCommand,
    INVALID_PARAMETERS:     eFeedRequestStatusInvalidParameters,
    MALFORMED:              eFeedRequestStatusMalformed,
    // BACKEND:                eFeedRequestStatusBackend,
    AUTH:                   eFeedRequestStatusAuth,
    // ACCESS:                 eFeedRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedRequestStatusCriteriaNotFound,
    NOT_FOUND:              eFeedRequestStatusNotFound,
    UNREACHABLE:            eFeedRequestStatusUnreachable,  //  Normally for patient etc. Also used by ping here.
    // TRANSPORT:              eFeedRequestStatusTransport,
    // FEEDHUB:               eFeedRequestStatusFeedHub,
} = EFeedRequestStatus;

const self = module.exports;

//  "own" lib/utils html, capitalizeName
self.html = html;
self.capitalizeName = capitalizeName;

self.logRequest = (req, logger) => {
    const { connection:{remoteAddress:ip}, originalUrl:route, method} = req;
    if (ip) logger.info(`[${route}] got a [${method}] from [${ip}]`);
};

const reply = self.reply = (res, v) => res.status(200).send(v);

self.handleGetOk = (res, okMessage, responseContent='') => reply(res,html.h3(okMessage
)+html.pre('string' === typeof responseContent ? responseContent : niceJSON(responseContent)));

self.handleGetError = (req, res, e) => {
    if (e instanceof AuthError) {
        const { message:headMsg, ownApiResponse:{message} } = e;
        logger.error(`${headMsg} on [${req.originalUrl}] request: ${message}`);
        reply(res, html.pre(message));
    }
    else {
        logger.error(`On [${req.originalUrl}] request :\n` + dbMsg(e));
        reply(res, html.pre('Unexpected error.'));
    }
};

const handleApiSuccess = (res, message, responseContent={}) => reply(res, FeedApiResponse({message, responseContent}));
self.handleApiSuccess = handleApiSuccess;

const handleApi = (res, status, message) => reply(res, FeedApiResponse({status, message}));
self.handleApi = handleApi;

self.handleApiUnreachable = (res, message) => handleApi(res, eFeedRequestStatusUnreachable, message);
self.handleMalformed      = (res, message) => handleApi(res, eFeedRequestStatusMalformed,   message);
self.handleNotFound       = (res, message) => handleApi(res, eFeedRequestStatusNotFound,    message);
self.handleAuth           = (res, message) => handleApi(res, eFeedRequestStatusAuth,        message);


const unexpectedError = (e, msg) => ({
    logMsg:`${msg}${e.isExpected ? `  ${dbMsg(e)}` : `\n${e.sql ? dbMsg(e) : e.stack}`}`,
    ownApiResponse:FeedApiResponse({status:eFeedRequestStatusInternal, message:`${msg}${e.isExpected ? `  ${e.message}` : ''}`}),
});

/**
 *
 * @param {object} res
 * @param {Error} e
 * @param {function():string} msg
 */
const handleApiError = (res, e, msg=()=>'') => {
    const {feedOp} = e;
    const {logMsg, ownApiResponse} = feedOp ? feedOp.handleApiError(e) : unexpectedError(e, msg());
    logger.error(logMsg);
    reply(res, ownApiResponse);
};
self.handleApiError = handleApiError;

const handleUnknownCommand = self.handleUnknownCommand = (req, res, command) => {
    const message = `post(${req.originalUrl}) command [${command}] unknown.`;
    logger.error(message);
    handleApi(res, eFeedRequestStatusInvalidCommand, message);
};

self.handleInvalidParameter = (res, message) => {
    logger.error(message);
    handleApi(res, eFeedRequestStatusInvalidParameters, message);
};

const defaultApiErrorHandling = self.defaultApiErrorHandling = (req, res, e) => {
    if (e instanceof AuthError) {
        const { message, ownApiResponse } = e;
        logger.error(`${message} on [${req.originalUrl}] request: ${ownApiResponse.message}`);
        return reply(res, ownApiResponse);
    }
    const message =  `Error on [${req.originalUrl}] request : `;
    logger.error(message, e);
    handleApi(res, eFeedRequestStatusMalformed, message + e.message);
};


/**
 *
 * @param {function(string, Provider, object):function(object, Provider, object, string)} handlerForCommand
 * @param {function(string|undefined):function(ApiUser)} isRoleAllowedForCommand
 * @returns {function(Object, Object)}
 */
const applyHandlerForCommand = (handlerForCommand, isRoleAllowedForCommand=(/*command*/)=>
                                                                                (apiUser =>
                                                                                            (apiUser && false))) =>
    async (req, res) => {
        self.logRequest(req, logger);

        //  commandsAndHandler is the object that provide a handler for each supported request command: e.g.
        //  commandsAndHandler = {                                          //  trackingId may be undefined
        //      "pullBundle": handler(res, feed.sapi, body.parameters, body.trackingId),
        //      "pullSingle": handler(res, feed.sapi, body.parameters, body.trackingId),
        //      "pushSingle": handler(res, feed.sapi, body.parameters, body.trackingId),
        //      "retireSingle": handler(res, feed.sapi, body.parameters, body.trackingId),
        //  }
        //
        //  This allows to have a single point (here!) where both:
        //  a) authorizeApiRequest() is performed AND responded.
        //  b) unsupported commands for a route are caught AND responded.
        //  c) a handler is picked according to the command name received in the request body (and optional potential
        //          req.params variables collected from route like 'my/route/:withVariable' and dispensary.sapi)
        //  d) the picked command handlers is called passing it:
        //      - the express route res,
        //      - the feed.sapi it found, and
        //      - the parameters and optional trackingId received in the request body.
        //
        //  All we thus have left to define in handlerForCommand is how to handle each command, and nothing else.

        try {
            const {parameters={}, command, trackingId, feedAlias} = req.body;

            // May throw AuthError on auth and feed-not-found failure
            const feed = await authorizeApiRequest(req.headers, {feedAlias, Feed},
                                                    isRoleAllowedForCommand(command));

            // Find if the command received in the body is one of those supported
            const commandHandler = handlerForCommand(command, feed.sapi, req.params);
            if (commandHandler) {                                                   //  Handle the command if supported;
                await commandHandler(res, feed.sapi, parameters, trackingId);     //  trackingId may be undefined.
            }
            else {
                handleUnknownCommand(req, res, command);
            }
        } catch (e)  {
            defaultApiErrorHandling(req, res, e);
        }
    };
self.applyHandlerForCommand = applyHandlerForCommand;


const pullBundle = sapiPullBundle =>
    async (res, sapi, params) => {
        const feedOp = sapi[sapiPullBundle.name];
        try {
            const feedItems = await feedOp(params);                                                     //  May throw!
            const message = `Returning a Bundle of [${feedItems.results.length}] ${feedOp.FeedItem.FeedItemName} from ${sapi.feedTag}.`;
            if (sapi.verbose) logger.trace(`${message}\n${JSON.stringify(feedItems)}`);
            handleApiSuccess(res, message, feedItems);
        }
        catch (e) {
            handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiPullBundle.name}(${JSON.stringify(params)}).`);
        }
    };

const pullSingle = sapiPullSingle =>
    async (res, sapi, params) => {
        const feedOp = sapi[sapiPullSingle.name];
        try {
            const feedItem = await feedOp(params);                                                      //  May throw!
            const message = `Returning ${feedOp.FeedItem.FeedItemName} [${feedItem.feedItemId}] from ${sapi.feedTag}.`;
            if (sapi.verbose) logger.trace(`${message}\n${JSON.stringify(feedItem)}`);
            handleApiSuccess(res, message, feedItem);
        }
        catch (e) {
            return handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiPullSingle.name}(${niceJSON(params)}]).`);
        }
    };

const addSingle = sapiAddSingle =>
    async (res, sapi, params) => {
        const feedOp = sapi[sapiAddSingle.name];
        try {
            const feedItem = await feedOp(params);                                                      //  May throw!
            const message = `Added ${feedOp.FeedItem.FeedItemName} to ${sapi.feedTag}.`;
            if (sapi.verbose) logger.trace(`${message}\n${JSON.stringify(feedItem)}`);
            handleApiSuccess(res, message, feedItem);
        }
        catch (e) {
            handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiAddSingle.name}(${niceJSON(params)}]).`);
        }
    };

const updateSingle = sapiUpdateSingle =>    //  todo: copy-paste-rename from addSingle, make sure it does what it's supposed
    async (res, sapi, params) => {
        const feedOp = sapi[sapiUpdateSingle.name];
        try {
            const feedItem = await feedOp(params);                                                      //  May throw!
            const message = `Updated ${feedOp.FeedItem.FeedItemName} [${feedItem.feedItemId}] of ${sapi.feedTag}.`;
            if (sapi.verbose) logger.trace(`${message}\n${JSON.stringify(feedItem)}`);
            handleApiSuccess(res, message, feedItem);
        }
        catch (e) {
            handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiUpdateSingle.name}(${niceJSON(params)}]).`);
        }
    };

const retireSingle = sapiRetireSingle =>
    async (res, sapi, params) => {
        const feedOp = sapi[sapiRetireSingle.name];
        try {
            const feedItem = await feedOp(params);                                                      //  May throw!
            const message = `Retired ${feedOp.FeedItem.FeedItemName} [${feedItem.feedItemId}] from ${sapi.feedTag}.`;
            if (sapi.verbose) logger.trace(`${message}\n${JSON.stringify(feedItem)}`);
            handleApiSuccess(res, message, feedItem);
        }
        catch (e) {
            handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiRetireSingle.name}(${niceJSON(params)}]).`);
        }
    };

const pushSingle = sapiPushSingle =>    //  todo: copy-paste-rename from addSingle, make sure it does what it's supposed
    async (res, sapi, params) => {
        const feedOp = sapi[sapiPushSingle.name];
        try {
            const feedItem = await feedOp(params);                                                      //  May throw!
            const message = `Pushed ${feedOp.FeedItem.FeedItemName} [${feedItem.id}] to [${sapi.feedTag}].`;
            if (sapi.verbose) logger.trace(`${message} ${JSON.stringify(feedItem)}`);
            handleApiSuccess(res, message, feedItem);
        }
        catch (e) {
            handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiPushSingle.name}(${niceJSON(params)}]).`);
        }
    };

const search = sapiSearch =>
    async (res, sapi, params) => {
        const feedOp = sapi[sapiSearch.name];
        try {
            const results = await feedOp(params);                                                     //  May throw!
            const message = `Returning an array of [${results.length}] ${feedOp.FeedItem.FeedItemName} search result from ${sapi.feedTag}.`;
            if (sapi.verbose) logger.trace(`${message}\n${JSON.stringify(results)}`);
            handleApiSuccess(res, message, results);
        }
        catch (e) {
            handleApiError(res, e, ()=>`${sapi.feedTag} : Failed unexpectedly attempting : sapi.${sapiSearch.name}(${JSON.stringify(params)}).`);
        }
    };


/**
 *
 * @param {FeedOps} feedOps
 * @param {function(string|undefined):function(ApiUser)} isRoleAllowedForCommand
 * @returns {Function}
 * @private
 */
const handleReq = (feedOps, isRoleAllowedForCommand) => {
    //  The following is executed once at routes load time. It can be slow.
    //  But the (req, res) => {} that it returns better be fast.

    //  The feedCore/lib/sapi provides the interface for all the feedOps on all the feedItems possible.
    //  The Feed lib/sapi however defines which it really supports by what it provides in the feedOps.
    //  null, undefined or 'empty' feedOps, results in the route for its feedItem (e.g. /feed/practitioner)
    //  to process it as a pseudo 404 : EFeedRequestStatus.NOT_FOUND.
    if ( ! feedOps  ||  ! Object.keys(feedOps).length) {                                //  A kinda 404, but different
        return (req, res) => {
            handleNotFound(res, `URL [${req.originalUrl}] not found here`);
        }
    }

    const {sapiPullBundle, sapiPullSingle, sapiPushSingle, sapiAddSingle, sapiUpdateSingle, sapiRetireSingle,
           sapiSearch } = feedOps;

    //  sapiPullBundle / sapiPullSingle / sapiAddSingle / ... are closures provided by sapi :
    //
    //  1) the Feed lib/sapi Provider provides  _PullBundles/_PullSingles/_AddSingles/.. tables that links all the
    //  sapi* functions to the FeedItemRecord handling it. (via .DaoPullSingle/DaoPullBundle/DaoAddSingle..)
    //
    //  2) sapi.bindFeedOps() uses these _PullBundles/etc tables to create FeedOp closures calling the FeedItemRecord
    //  .DaoPullBundle/etc. with params argument. In /feed API routes, the request.body.parameters is passed in params
    //  argument to these closures, which results in dao feedOp ready to be performed and handled with api facilities.
    //
    //  3) these sapi FeedOp instantiating closures are grouped according to their FeedItemRecord into sapi.*FeedOps
    //  object (e.g. sapi.patientFeedOps= { sapiPullBundle: sapi.pullPatientBundle,
    //                                      sapiPullSingle: sapi.pullSinglePatient,
    //                                      ...
    //                                      sapiAddSingle:  sapi.addSinglePatient } ), and passed as 2nd argument here.

    const commandsAndHandlers = {
        pullBundle  : sapiPullBundle    ?  pullBundle(  sapiPullBundle)     :  undefined,
        pullSingle  : sapiPullSingle    ?  pullSingle(  sapiPullSingle)     :  undefined,
        pushSingle  : sapiPushSingle    ?  pushSingle(  sapiPushSingle)     :  undefined,
        addSingle   : sapiAddSingle     ?  addSingle(   sapiAddSingle)      :  undefined,
        updateSingle: sapiUpdateSingle  ?  updateSingle(sapiUpdateSingle)   :  undefined,
        retireSingle: sapiRetireSingle  ?  retireSingle(sapiRetireSingle)   :  undefined,
        search      : sapiSearch        ?  search(sapiSearch)               :  undefined,
    };

    //  The applyHandlerForCommand() first argument, handlerForCommand, is a function that provide one handler for each
    //      supported request command: e.g.
    //  handlerForCommand = command => ({
    //      "pullBundle": handler(res, feed.sapi, body.parameters),
    //      "pullSingle": handler(res, feed.sapi, body.parameters),
    //      "pushSingle": handler(res, feed.sapi, body.parameters),
    //      "retireSingle": handler(res, feed.sapi, body.parameters),
    //  }[command])
    return applyHandlerForCommand(command => commandsAndHandlers[command], isRoleAllowedForCommand);

    //  It is passed to applyHandlerForCommand, which auths the request and calls the command handler.
    //
    //  This allows applyHandlerForCommand to be the single place where:
    //  a) authorizeApiRequest() (user authentication, dispensaryId and API access validation) is performed AND responded.
    //  b) unsupported commands for a route are caught AND responded.
    //  c) a handler is picked according to the command name received in the request body (and maybe request.params)
    //  d) the picked command handlers is called passing it:
    //      - the express route res,
    //      - the dispensary.sapi it found, and
    //      - the parameters and optional trackingId received in the request body.
    //
    //  All we thus have left to define in handlerForCommand is how to handle each command, and nothing else.
    //  There's 6 predefined (pullBundle, pullSingle, addSingle, etc..) closures defined just above for that
    //  purpose, used here. They start by calling the sapi FeedOp instantiating closure specified by the .name of
    //  the sapiPullBundle|sapiPullSingle|..., passed in 2nd argument to this _handleReq()
    //  via one of the sapi.*FeedOps object (.patientFeedOps, ...) for a route ('/patient' etc...).
    //
    //  It's entirely structured by data: association between route and sapi call and spi.nao FeedOp classes.
    //  All the .pullFromSrc() .pushToDst() & .retire() work the same, regardless of the FeedItem pulled/pushed.
    //  Therefore the pullBundle|pullSingle|pushSingle|retireSingle handlers only need to be defined once.
    //  And finally the closure instantiation and selection mechanism / mapping is performed only once at module load
    //  time. Which result as a bonus in very efficient code.
};
self.handleReq = handleReq;


logger.trace("Initialized ...");
