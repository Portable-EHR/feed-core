/**
 * Created by WebStorm.
 * User: yvesleborg
 * Date: 2016-08-21
 * Time: 5:21 PM
 *
 * © Copyright Portable EHR inc, 2017
 *
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const {sha256}= require('js-sha256');
const logger  = require('log4js').getLogger(fileTag);

const { niceJSON, Enum, EItem, ErrorExtender, ErrorWrapper,
        expectedErrorProtoDefaultProps, } = require('../../nodeCore/lib/utils');
const { IpSocketError, StatusError, Unpacking, BackendError, FeedHubError, SelfStatusErrorBody } = require('../../nodeCore/lib/nao');

//region Feed, FeedHub and Backend ApiResponse   from lib/api

const { EFeedRequestStatus, FeedApiResponse, EFeedHubRequestStatus, ERequestToBackendStatus, } = require('../../nodeCore/lib/api');

const {
    // OK:                     eFeedRequestStatusOk,
    INTERNAL:               eFeedRequestStatusInternal,
    // INVALID_COMMAND:        eFeedRequestStatusInvalidCommand,
    INVALID_PARAMETERS:     eFeedRequestStatusInvalidParameters,
    // MALFORMED:              eFeedRequestStatusMalformed,
    BACKEND:                eFeedRequestStatusBackend,
    // AUTH:                   eFeedRequestStatusAuth,
    // ACCESS:                 eFeedRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedRequestStatusCriteriaNotFound,
    // NOT_FOUND:              eFeedRequestStatusNotFound,
    // UNREACHABLE:            eFeedRequestStatusUnreachable,  //  Used by ping here.
    TRANSPORT:              eFeedRequestStatusTransport,
    FEEDHUB:                eFeedRequestStatusFeedHub,
} = EFeedRequestStatus;

const {
    // OK:                     eFeedHubRequestStatusOk,
    INTERNAL:               eFeedHubRequestStatusInternal,
    // INVALID_COMMAND:        eFeedHubRequestStatusInvalidCommand,
    // INVALID_PARAMETERS:     eFeedHubRequestStatusInvalidParameters,
    // MALFORMED:              eFeedHubRequestStatusMalformed,
    // BACKEND:                eFeedHubRequestStatusBackend,
    // AUTH:                   eFeedHubRequestStatusAuth,
    // ACCESS:                 eFeedHubRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedHubRequestStatusCriteriaNotFound,
    // NOT_FOUND:              eFeedHubRequestStatusNotFound,
    // UNREACHABLE:            eFeedHubRequestStatusUnreachable,  //  Normally for patient etc. Also used by ping here.
    TRANSPORT:              eFeedHubRequestStatusTransport,
} = EFeedHubRequestStatus;

const {
    // OK:                     eRequestToBackendStatusOk,
    MALFORMED_REQUEST:      eRequestToBackendStatusMalformedRequest,// JSON.parse error or missing parameter (trackingId)
    // NO_ACCESS:              eRequestToBackendStatusNoAccess,        // privileges, read-write permissions, the like.  200 NO_ACCESS
    // AUTH_FAILED:            eRequestToBackendStatusAuthFailed,      // bad apiKey, deviceGuid, userGuid 200 AUTH_FAILED
    INVALID_COMMAND:        eRequestToBackendStatusInvalidCommand,
    INTERNAL_ERROR:         eRequestToBackendStatusInternalError,
    INVALID_PARAMETERS:     eRequestToBackendStatusInvalidParameters,
    INVALID_SYNTAX:         eRequestToBackendStatusInvalidSyntax,
    CONFLICT:               eRequestToBackendStatusConflict,       // if a person ID data is in confict with that of another,
    // UNKNOWN_NOTIFICATION:   eRequestToBackendStatusUnknownNotification,  //  received a notification from unblessed source.
    NOT_FOUND:              eRequestToBackendStatusNotFound,
    MAINTENANCE:            eRequestToBackendStatusMaintenance,
    // NOT_REACHABLE:          eRequestToBackendStatusNotReachable,    // a patient or user has no active device
} = ERequestToBackendStatus;

//endregion

const self = module.exports;


const EFlow = (f=>{f.prototype=new Enum(f); return new f({});})(function EFlow({
    toBackend=(f=>f(f))(function toBackend(f) { return EItem(EFlow, f); }),
    toFeed   =(f=>f(f))(function toFeed(f)    { return EItem(EFlow, f); }),
}) {  Enum.call(Object.assign(this, {toBackend, toFeed})); });
const {
    toBackend: eFlowsToBackend,
    toFeed:    eFlowsToFeed,
} = EFlow;
Object.assign(self, {EFlow, eFlowsToBackend, eFlowsToFeed});


//region FeedOp Error definitions

const feedOpErrorProtoDefaultProps = (createdConstructor)=>({
    ...expectedErrorProtoDefaultProps(createdConstructor),
    eFeedHubRequestStatus: {writable:true, value: function() { //  this.statusCode is undefined except for StatusError.
                                return this.feedOp.eFeedHubRequestStatusForError(createdConstructor.name, this.statusCode); }},
    shortMessage:           {writable:true, value: function() { return `${createdConstructor.name}: ${this.message}`; }},
    logMessage:             {writable:true, value: function(/*{verbose}*/) { return this.verboseMsg; }},
});

const DeclareFeedOpError = (constructor, feedOpErrorAssignedProto={}) => {
    constructor.BuildErrorProtoProps = feedOpErrorProtoDefaultProps;
    constructor.ErrorAssignedProto = feedOpErrorAssignedProto;
};

//  Overrides DeclareExpectedError() of [IpSocketError, StatusError, Unpacking, BackendError] with DeclareFeedOpError()

DeclareFeedOpError(IpSocketError, {
    shortMessage() {
        return (({feedOp})=>`${this.message}${feedOp.isOfFeed && !feedOp.isPumpOp ? ' '+this.msgHead() : ''}`)(this); },
});

DeclareFeedOpError(StatusError, {
    eFeedHubRequestStatus() { return this.feedOp.eFeedHubRequestStatusForError(StatusError.name, this.statusCode); },
    shortMessage() {
        const { feedOp:{isOfFeed, isPumpOp}, msgHead, message, body=SelfStatusErrorBody()} = this;  //  cut the '\n'
        return `${message}${body.body? ` [${body.expose()}]` :''}${isOfFeed && !isPumpOp? ' '+msgHead().slice(0,-1) :''}`; },

    logMessage({verbose=false}) {    //  that's the pump.verbose
        const {feedOp:{isApiWebOpVerbose, verboseEndpoint, srcAndDstItemStrs, isLoggedForError}, body, statusCode }=this;
        verbose = verbose || isApiWebOpVerbose || verboseEndpoint;

        const {isFeedItemLogged, isUriLogged} = isLoggedForError(StatusError.name, statusCode);
        const items =  (isFeedItemLogged || verbose) ? srcAndDstItemStrs.join('') : '';

        return items + (isUriLogged ? (items ? '.'  : '') + this.verboseMsg
                                    : (items ? '\n' : '') + this.message   ) + (body.body ? ' '+body.expose() : '');
    },
});

DeclareFeedOpError(Unpacking); //  Makes ErrorWrapper add the default .logMessage() .eFeedHubRequestStatus() to proto

DeclareFeedOpError(BackendError, {
    shortMessage() { return this.message; },
    shorter(msg)   { return msg.replace(/^Backend( Api\[[^\]]*\])?/, ''); },
    logMessage({verbose=false}) {   //  that's the pump.verbose
        const {backendApiRequestStatus:{status}, feedOp:{isApiWebOpVerbose, srcAndDstItemStrs, isLoggedForError}}=this;
        verbose = verbose || isApiWebOpVerbose || this.feedOp.verboseEndpoint;

        const {isFeedItemLogged,  isUriLogged} = isLoggedForError(BackendError.name, status);
        const items =  (isFeedItemLogged || verbose) ? srcAndDstItemStrs.join('') : '';

        return items + (isUriLogged ? (items ? '.'  : '') + this.verboseMsg
                                    : (items ? '\n' : '') + this.message   );
    },
});

DeclareFeedOpError(FeedHubError, {
    eFeedHubRequestStatus() { return this.feedHubApiRequestStatus.eStatus; },
    shortMessage() { return this.message; },
    logMessage({verbose=false}) {   //  that's the pump.verbose
        const {feedHubApiRequestStatus:{status}, feedOp:{isApiWebOpVerbose, srcAndDstItemStrs, isLoggedForError}}=this;
        verbose = verbose || isApiWebOpVerbose || this.feedOp.verboseEndpoint;

        const {isFeedItemLogged, isUriLogged} = isLoggedForError(FeedHubError.name, status); //todo add isLoggedForError() for FeedHubError somewhere....
        const items =  (isFeedItemLogged || verbose)  ?  srcAndDstItemStrs.join('')  :  '';

        return items + (isUriLogged ? (items ? '.'  : '') + this.verboseMsg
                                    : (items ? '\n' : '') + this.message   );
    },
});

//  Now that they've been made FeedOp errors, own them all.
Object.assign(self, {IpSocketError, StatusError, Unpacking, BackendError, FeedHubError});


const FeedItemValidation = self.FeedItemValidation = function FeedItemValidation(msg, msgHead, xtra={}){
    return ErrorExtender(msg, FeedItemValidation, xtra, msgHead);
};
DeclareFeedOpError(FeedItemValidation); //  Makes ErrorExtender add default .eFeedHubRequestStatus() .shortMessage() .logMessage()  to proto


//  WARNING
//
//  DstItemCompositionError MUST NOT be used as the right-hand expression of the JavaScript "instanceof" operator.
//  The lib/utils function isInstanceOfError() MUST be used instead.
//  Wrapping errors of potentially multiple different prototypes can cause "instanceof" to wrongly return false.
/**
 *
 * @param {Error} error
 * @returns {Error}
 * @constructor
 */
const DstItemCompositionError = self.DstItemCompositionError =function DstItemCompositionError(error){
    return ErrorWrapper(error, DstItemCompositionError);
};
DeclareFeedOpError(DstItemCompositionError, {
    eFeedHubRequestStatus() {                          //  Use wrappedError (Unpacking..) to select status.
        return this.feedOp.eFeedHubRequestStatusForError(this.wrappedError.constructor.name, this.statusCode);
    },                                                  //  this.statusCode is undefined except for StatusError.
    shortMessage() {
        const {feedOp, srcItem:{Name}, wrappedError} = this;
        return  (feedOp.isPumpOp ? '' : `Converting ${Name} to ${feedOp.toTag} syntax: `
                ) + (wrappedError.isExpected ?  expectedErrorShortMessage(wrappedError)
                                             :unexpectedErrorShortMessage(wrappedError)); },
    logMessage({verbose=false}) {   //  that's the pump.verbose
        const {wrappedError, feedOp:{isApiWebOpVerbose}} = this;
        verbose = verbose || isApiWebOpVerbose;         //  .verboseEndpoint is already covered by the wrappedError.
        return `srcItem: ${this.srcItem}\n` + (
                wrappedError.isExpected ?  expectedErrorLogMessage(wrappedError, verbose)   //  srcItem already shown.
                                        :unexpectedErrorLogMessage(wrappedError, {srcAndDstItemStrs:[]})  ); },
});

//endregion

//region (un)expectedErrorLogMessage(), (un)expectedErrorShortMessage(), (un)expectedErrorStatus()

// expectedError* could have been defined as part of the lib/utils ExpectedErrorProto.
// It's kept here for completeness/symmetry, as unexpectedErrorLogMessage takes feedOp argument.
const unexpectedErrorLogMessage   = (e, feedOp) => feedOp.srcAndDstItemStrs.join('') + e.stack;
const   expectedErrorLogMessage   = (e, verbose=false) => {
    try {       return e.logMessage({verbose});}
    catch (e) {
                return  e.verboseMsg;          }
};
const unexpectedErrorShortMessage = e => `${e.constructor.name}: ${e.message}`;
const   expectedErrorShortMessage = e => {
    try {       return e.shortMessage();                        }
    catch (e) {
                return unexpectedErrorShortMessage(e);   }
};
const unexpectedErrorStatus = ()=> eFeedHubRequestStatusInternal;
const   expectedErrorStatus = e => {
    try {       return e.eFeedHubRequestStatus();                        }
    catch (e) {
        return unexpectedErrorStatus();   }
};
self.  expectedErrorLogMessage   =   expectedErrorLogMessage;
self.unexpectedErrorShortMessage = unexpectedErrorShortMessage;
self.  expectedErrorShortMessage =   expectedErrorShortMessage;
self.  expectedErrorStatus       =   expectedErrorStatus;

self.  expectedErrorTransportStatus =  e => (eFeedHubRequestStatusTransport === expectedErrorStatus(e));

self.  expectedBackendErrorMaintenanceStatus =  e => {  const {backendApiRequestStatus:{eStatus}={}} = e;
                                                        return eRequestToBackendStatusMaintenance === eStatus; };
//endregion

//region FeedOp, FeedItem  & DstItem

const getThisParamsId = function() { return this.params.id; };
class FeedOp {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }

    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }

    get feed() {      return this.endpoint._owner._feed;    }           //  _owner is the adapter here.
    get feedAlias() {    return this.endpoint._owner._feed.alias; }           //  _owner is the adapter here.
    get verboseEndpoint() { return this.endpoint._owner.verbose; }

    get isApiSuccessVerbose(){ return false; }                                      //  Both candidates for overriding
    get isApiWebOpVerbose()  { return false; }          //  WebOp is the web operation part of FeedOp (vs convert).

    get FeedProvider() { return this.endpoint.feedProvider; }       //  candidate for overriding by spi.nao SetupFeed()s
    get feedTag() { return `${this.FeedProvider} ${this.feed.fullTag}`; }
    get isOfFeed() { throw new Error(`${this.Name}.prototype.get isOfFeed() : Not defined yet. Override me !`); }   // either .isFromFeed (pull) or .isToFeed (push) or directly .isOfFeed (retire)
    get ofTags() { return this.isOfFeed ? [this.feedTag , 'FeedHub'] : ['FeedHub', this.feedTag] ; }
    get isToFeed() { return undefined; }            //  SMALL HACK: isToFeed is defined in a push, isFromFeed in a pull.
    get fromToTags() {                                                                  //  candidate for overriding
        const {ofTags:[pullSrcTag, pullDstTag]}=this;// SMALL HACK: isToFeed is defined in a push, isFromFeed in a pull.
        const [srcTag, dstTag] = undefined===this.isToFeed ? [pullSrcTag, pullDstTag] : [pullDstTag, pullSrcTag];
        return `from ${srcTag} to ${dstTag}`;
    }                                               //  SMALL HACK: isToFeed is defined in a push, isFromFeed in a pull.
    get toTag() { return (!this.isOfFeed) !== (undefined===this.isToFeed)  ? 'Backend' : `${this.FeedProvider} Feed`; }// XOR
    get tag() {  throw new Error(`${this.Name}.prototype.get tag() : Not defined yet. Override me !`); }
    get _errorMsg() { return `Failed performing ${this.tag} ${this.fromToTags} :`; }    //  candidate for overriding
    logMessage(e) { const {srcItem} = e; return srcItem ? srcItem.convertErrorMsg : this._errorMsg; }
    get isPumpOp() { return false; }    //  candidate for overriding at instance level of PumpEngine reusedPullBundle and reusedPushSingle.
    get feedItemId() {  throw new Error(`${this.Name}.prototype.get feedItemId() : Not defined yet. Run ${this.Name}.Setup() !`); }

    //  "generic" (eDirection-independent) version.
    _handleError(e) {
        throw Object.assign(e, {feedOp:this});
    }

    //region API error handling

    isLoggedForError(ErrorConstructorName, extraCriteria) { throw new Error(`${this.Name}.prototype.isLoggedForError(ErrorConstructorName[${ErrorConstructorName}, extraCriteria[${extraCriteria}]) : Not defined yet. Run ${this.Name}.Setup() !`); }

    eFeedHubRequestStatusForError(ErrorConstructorName, extraCriteria) { throw new Error(`${this.Name}.prototype.eFeedHubRequestStatusForError(ErrorConstructorName[${ErrorConstructorName}, extraCriteria[${extraCriteria}]) : Not defined yet. Run ${this.Name}.Setup() !`); }

    get srcAndDstItemStrs() { return ['', ''];}

    //  "generic" (eDirection-independent) version.
    handleApiError(e) {
        return e.isExpected ? { logMsg: this.logMessage(e) + '\n' +   expectedErrorLogMessage(e),
                                nodeApiResponse:FeedApiResponse({   status:   expectedErrorStatus(e),
                                                                    message:  expectedErrorShortMessage(e)})  }
                            : { logMsg: this.logMessage(e) + '\n' + unexpectedErrorLogMessage(e, this),
                                nodeApiResponse:FeedApiResponse({   status: unexpectedErrorStatus( ),
                                                                    message:unexpectedErrorShortMessage(e)})  };
    }

    //endregion
                                // fits FeedPullSingle and FeedRetireSingle
    static get getFeedItemId() { return getThisParamsId; }                          //  Candidate for overriding !
    static get path() { return ''; }
    static get command() { return ''; }
    get eDirection() { throw new Error(`${this.Name}.eDirection : Not defined yet. Run ${this.Name}.Setup() !`);}
    get path() {    return this._path;    }                         //  defined in .Setup() from static get path().
    get command() { return this._command; }                         //  defined in .Setup() from static get command().
    static get FeedProviderFullTag() { throw new Error(`${this.Name}.FeedProviderFullTag : Not defined yet. Run ${this.Name}.Setup() !`); }
    static SetupFeedHub(baseProto, eDirection, isOfFeed) {
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
        const thisProto = This.prototype;

        Object.defineProperty(This, 'eDirection', {value: eDirection});
        Object.defineProperty(thisProto, 'eDirection', {value: eDirection});
        Object.defineProperty(thisProto, 'isOfFeed', {value:isOfFeed});
        Object.defineProperty(thisProto, '_path', {value: This.path});
        Object.defineProperty(thisProto, '_command', {value: This.command});
        Object.defineProperty(thisProto, 'feedItemId', {configurable: true, get: This.getFeedItemId});  //  Candidate for overriding ! (by PullBundle notably)

        thisProto._handleError = baseProto._handleError;

        // Could've been a static function : 'this' is not used once. It's defined in prototype for calling convenience.
        baseProto.isLoggedForError = (ErrorConstructorName, extraCriteria) => (
                                  //  Default value: {isFeedItemLogged:false, isUriLogged:false}
                (selectionFunction=()=>{})=>((result={isFeedItemLogged:false, isUriLogged:false})=>result)(
                                              selectionFunction(extraCriteria)) //  run the function selected by [ErrorConstructor]
            )({
                [StatusError.name]: statusCode => ({   //  extraCriteria passed as statusCode to this selection function
                    //  The backend generates a 500 on any un-handled error thrown: it's a code maintainer mistake to fix.
                    [500]: {isFeedItemLogged: true, isUriLogged: false},
                    //  The backend generates a 404 NotFound when the path of an uri is wrong.
                    [404]: {isFeedItemLogged: false, isUriLogged: true},                //  Default value for the rest
                }[statusCode]),
                [FeedHubError.name]: eFeedHubStatus=>({//  extraCriteria passed as eFeedHubStatus to this selection function
                    // JSON.parse error or missing parameter (trackingId) : unlikely
                    //  todo`change eRequestToBackendStatus* with e{Node!FeedHub}Status* and select appropriate {isFeedItemLogged,isUriLogged} for each.
                    [eRequestToBackendStatusMalformedRequest]     : {isFeedItemLogged:true,  isUriLogged:true },
                    [eRequestToBackendStatusInvalidCommand]       : {isFeedItemLogged:false, isUriLogged:true },
                    [eRequestToBackendStatusInternalError]        : {isFeedItemLogged:true,  isUriLogged:true },
                    [eRequestToBackendStatusInvalidParameters]    : {isFeedItemLogged:true,  isUriLogged:false},
                    [eRequestToBackendStatusInvalidSyntax]        : {isFeedItemLogged:true,  isUriLogged:false},
                    [eRequestToBackendStatusConflict]             : {isFeedItemLogged:true,  isUriLogged:false},
                    [eRequestToBackendStatusNotFound]             : {isFeedItemLogged:true,  isUriLogged:false},

                    //  The following get the Default               {isFeedItemLogged:false,  isUriLogged:false}

                    // eRequestToBackendStatusNoAccess, // privileges, read-write permissions, the like.  200 NO_ACCESS
                    // eRequestToBackendStatusAuthFailed,           // bad apiKey, deviceGuid, userGuid 200 AUTH_FAILED
                    // eRequestToBackendStatusUnknownNotification,  // received a notification from unblessed source.
                    // eRequestToBackendStatusMaintenance,
                    // eRequestToBackendStatusNotReachable          // a patient or user has no active device

                }[eFeedHubStatus])                                                      //  Default value for the rest
            }[ErrorConstructorName]   //  The ErrorConstructorName directly selects a second layer selection function
        );
        thisProto.isLoggedForError = baseProto.isLoggedForError;

        // Could've been a static function : 'this' is not used once. It's defined in prototype for calling convenience.
        baseProto.eFeedRequestStatusForFeedHubError=(ErrorConstructorName, extraCriteria)=>(//  extraCriteria is statusCode
                (result=eFeedRequestStatusInternal) =>  // eFeedHubRequestStatusInternal if ErrorConstructor's not covered here
                    EFeedRequestStatus[result] ? result                 //  return result if it's a EFeedRequestStatus
                                               : result(extraCriteria)  //  otherwise it's the function(statusCode) of StatusError
            )({
                [IpSocketError.name]      : eFeedHubRequestStatusTransport,
                //  FeedHub WebRequest timeout (36s, covers worst DNS, etc) :  when a client timeout -> abort :
                //      -Before receiving any response from server: socketError ('Error: socket hang up' and code 'ECONNRESET')
                //      -After started receiving response: StatusError with known status (including 2XX) and incomplete response
                //          -Treat 2XX, 3XX and 5XX\500 like IpSocketError: TRANSPORT error equivalent
                //
                //  FeedHub TransportError-like statusCode range covers:
                //      - Client timeout/abort part-way through receiving a 2XX Success response from server  [200:300]
                //      - Server redirect (interrupted or not by a client timeout/abort)                      [300:400]
                //      - Server errors different than 500 (interrupted or not by a client timeout/abort)     [501:   ]
                [StatusError.name]:         statusCode => (                                                         // [200:400]
                    (200 <= statusCode && statusCode < 400  ||  501 <= statusCode) ? eFeedRequestStatusTransport :  // [501:   ]

                    //  The backend generates a 500 on any un-handled error thrown: it's a code maintainer mistake to fix.
                    (statusCode === 500) ?                                           eFeedRequestStatusBackend   :  // [500:501]

                    //  000: Internal endpoint._webRequest  maxAttempts=0 error.  Unlikely. Internal yet expected !
                    (statusCode < 100) ?                                             eFeedRequestStatusInternal  :  // [   :100]

                    //  This covers all backend auth/NotFound/Malformed related issues: SHOULD NEVER happen (except 404)
                    //  (400 =< statusCode  || statusCode < 500)    //  answered with 200 OK and a BackendApiResponse.eStatus
                                                                                     eFeedRequestStatusBackend  ),  // [400:500]
                [FeedHubError.name]       : eFeedRequestStatusFeedHub,      // todo use an arrow function with status arg, to return feedStatus Backend on feedHubStatus Backend.
                [Unpacking.name]          : eFeedRequestStatusFeedHub,  //  Apache responds with html rather than php with JSON: same as 500
                [FeedItemValidation.name] : eFeedRequestStatusInvalidParameters,
            }[ErrorConstructorName]   //  The ErrorConstructorName directly selects eStatus or StatusError function(statusCode)
        );
        thisProto.eFeedRequestStatusForFeedHubError = baseProto.eFeedRequestStatusForFeedHubError;

        thisProto.handleApiError = baseProto.handleApiError;

        return This;
    }
}
self.FeedOp = FeedOp;

const noSha = 'noSha';
const getFeedItem_id = function() { return this.id; };
class FeedItem {                    //  rx_whatever and last_updated either from FeedItemRecord, or undefined by default
    constructor(feedOp, srcJsOb, {rx_payload:srcJson, rx_sha, rx_date, _validationErrorMessage, last_updated, tx_payload}={}) {
        srcJson = srcJson  ?  srcJson  :  JSON.stringify(srcJsOb);
        Object.defineProperty(this, '_feedOp', {value: feedOp}); //  feedPullBundle | feedPullSingle | feedPushSingle
        Object.defineProperty(this, '_srcJsOb', {value: srcJsOb});
        Object.defineProperty(this, '_srcJson', {value: srcJson});
        Object.defineProperty(this, '_srcSha',  {value: rx_sha  ?  rx_sha  :  sha256(srcJson)});
        Object.defineProperty(this, '_rxTimestamp', {value: rx_date  ?  rx_date  :  new Date()});

        if (last_updated instanceof Date) {                         // undefined, unless Feeditem is BuiltFromRecord
            Object.defineProperty(this, '_lastUpdated', {value: last_updated});
        }
        if ('string' === typeof _validationErrorMessage) {          // undefined, unless Feeditem is BuiltFromRecord
            Object.defineProperty(this, "_validationErrorMessage", {configurable:true, value:_validationErrorMessage});
        }
        if ('string' === typeof tx_payload) {                       // undefined, unless Feeditem is BuiltFromRecord
            try {
                const dstJsOb = JSON.parse(tx_payload);
                if (null !== dstJsOb  &&  undefined !== dstJsOb) {
                    this._setDstJsOb(dstJsOb);
                    this._setDstJson(tx_payload);
                }
            }
            catch (e) {
                logger.warn(`In ${this.Name}() of srcJsOb [${JSON.stringify(srcJsOb)}] : Error parsing json tx_payload from FeedItemRecord\n`, e);
            }
        }
    }

    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }
    get endpoint() { return this._feedOp.endpoint; }
    get feed() { return this._feedOp.endpoint._owner._feed; }           //  _owner is the adapter here.
    get caching() { return this._feedOp.endpoint._owner._sapi.caching; }
    get feedTag() { return this._feedOp.feedTag; }
    get tag() { return this.feedItemId; }                                           //  Candidate for overriding !
    toString() { return this._srcJson; }                                            //  Candidate for overriding !

    //  In some feed/dispensary techno like MobileMed, the feedItems don't carry the notion of the last time they've
    //  been persisted in the Feed (inserted or updated), lastUpdated is therefore set by FeedHub to the best
    //  approximation it can make.
    //
    //  If the feedItem.feedOp has a .endDate (it queries by timeslice), then .lastUpdated is approximated
    //  to that .endDate that was used to limit the Pull: it can't be more recent than that .endDate.
    //
    //  If we don't have such time reference as part of the feedPull feedOp, then we use the time the feeditem has been
    //  received in feedHub. (Which will always be larger than .endDate).
    //
    //  More apt feed technos MUST override FeedItem lastUpdated with their own methods.

    get lastUpdated() {                                                                 //  Candidate for overriding !
        const lastUpdated = this._lastUpdated;                      //  If that FeedItem was BuildFromRecord().
        if (undefined !== lastUpdated) return lastUpdated;

        const pullBundleParams = this._feedOp.srcPullParams;   //  undefined if !feedPullBundle, or !Criterias.SliceOfPeriod
        return ((pullBundleParams  &&  undefined !== pullBundleParams.endDate)  ?  pullBundleParams.endDate
                                                                                :  this._rxTimestamp);
    }

    get feedItemId() { throw Error(`get ${this.Name}.prototype.feedItemId() : Not defined yet. Run ${this.Name}.Setup() !`); }

    static get eDirection() {throw new Error(`get ${this.Name}.eDirection() : Not defined yet. Override me !`);}
    static get getFeedItemId() { return getFeedItem_id; }                               //  Candidate for overriding !
    /**
     *
     * @param {function(object):DstItem} DstItem always genuine. A common version provided by a Backend FeedItem won't do.
     * @returns {FeedItem}
     * @constructor
     */
    static Setup(DstItem) {
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.

        const {eDirection, getFeedItemId} = This;
        if (EFlow !== eDirection.Enum) {
            throw Error(`${This.Name} .Setup() argument eDirection [${eDirection}] is not one of ${EFlow._name}: [${EFlow.join()}].`);
        }
        const isToFeed = eDirection === eFlowsToFeed;

        Object.defineProperty(This, 'eDirection', {value: eDirection});
        Object.defineProperty(This, 'isToFeed', {value:isToFeed});
        Object.defineProperty(This, 'DstItem', {value: DstItem} ).DstItem.chainProto();

        // non-static properties            (using function, not arrow function, to get access to instance "this")
        const thisProto = This.prototype;

        Object.defineProperty(thisProto, 'eDirection', {value: eDirection});
        Object.defineProperty(thisProto, 'isToFeed', {value:isToFeed});
        Object.defineProperty(thisProto, 'feedItemId', { get: getFeedItemId });
        Object.defineProperty(thisProto, 'fullValidationErrorMessage', { get() {
                    return this.constructor.FullValidationErrorMessage(this.validate()); }});

        return This;
    }

    //  HACK:       rx_sha:noSha prevents the calculation of the FeedItem sha256(srcJsOb).
    static BuildFromJsOb(feedOp, srcJsOb, withSha=true) { return new this(feedOp, srcJsOb, withSha?{}:{rx_sha:noSha});}

    static BuildFromRecord(feedOp, feedItemRecord) {
        return new this(feedOp, JSON.parse(feedItemRecord.rx_payload), feedItemRecord);
    }         //  'this' is the static This: the class constructor.

    linkToPushFeedOp() {        //  this._feedOp is not checked, caller is responsible to only do it on FeedPushSingle.
        const { _dstJsOb:dstItem } = this;      //  dstItem may be undefined or not
        return Object.assign(this._feedOp, { dstItem, srcItem:this}).srcItem;   //  .srcItem always assigned
    }

    //region Validation "interface":  ._validate()  must be overridden by all extending classes.

    /**
     *
     * @param {Array} validationErrorMessageList
     * @returns {Array<string>} validationErrorMessageList
     * @private
     */
    _validate(validationErrorMessageList=[]) {                                          //  Must be overridden!
        throw  new Error(`${this.Name}._validate(validationErrorMessageList=[]) => validationErrorMessageList; : not implemented by extended class yet. Override me!`);
        //return validationErrorMessageList;
    }

    _compileValidationErrorMessageList(validationErrorMessageList=[]) {
        if ( ! validationErrorMessageList instanceof Array) {
            throw Error(`${this.Name}._validate() definition must return an Array of validation error message strings, empty when valid.`);
        }
        Object.defineProperty(this, '_validationErrorMessageList', {configurable:true, value:validationErrorMessageList});
        const message = validationErrorMessageList.join('\n');
        Object.defineProperty(this, '_validationErrorMessage', {configurable:true, value:message});
        return message;
    }

    /**
     *
     * @param validationErrorMessageList
     * @returns {string} validationErrorMessage: empty string '' if no validation error.
     */
    validate(validationErrorMessageList=[]) {                                               //  === shallowValidate()
        let message = this._validationErrorMessage;
        if (undefined === message) {
            message = this._compileValidationErrorMessageList(this._validate(validationErrorMessageList));
        }
        return message;
    }

    /**
     *
     * @param {string} message
     */
    invalidate(message) {
        let messageList = this._invalidationMessageList;
        if (undefined === messageList) {
            messageList = [];
            Object.defineProperty(this, '_invalidationMessageList', {configurable:true, value:messageList});
        }
        messageList.push(message);

        //  HACK ALERT
        //                              Add a .validate as instance own (configurable so it can be deleted) property,
        //  overriding that of the prototype until it is called.        See ._validateThenAddInvalidated() just below.
        return Object.defineProperty(this, 'validate', {configurable:true, value:this.validateThenAddInvalidated});
    }

    validateThenAddInvalidated(){       //  HACK:   normally called under "validate" name, See .invalidate() just above.
        let message = this.constructor.prototype.validate.call(this); //  calling this.validate() would infinitely loop.

        let {_invalidationMessageList=[],   //  At least one message in _invalidationMessageList after .invalidate().
                          _validationErrorMessageList} = this;
        if (undefined === _validationErrorMessageList)  {           //  _validationMessageError was set at construction
            _validationErrorMessageList = message ? message.split('\n') : [];   //  otherwise [ '' ] if message is ''
            Object.defineProperty(this, '_validationErrorMessageList', {configurable:true, value:_validationErrorMessageList});
        }

        _validationErrorMessageList.push(..._invalidationMessageList);  //  append to this._validationErrorMessageList
        message = (message ? message+'\n' : '') + _invalidationMessageList.join('\n');
        Object.defineProperty(this, '_validationErrorMessage', {configurable:true, value:message});

        //  HACK ALERT
        //  Now that we're done, delete this instance own configurable .validate property, falling back to the
        //  usual prototype instance of .validate.
        //
        //  Complement to .invalidate() above where validateThenAddInvalidated is added as own .validate property,
        //  effectively overriding it until it's executed.  This allows a .toDstLitOb() instance to shallow .validate()
        //  a feedItem, then conditionnaly .invalidate() it one or more times, then .throwIfInvalid() at the end, which
        //  runs this temporary instance of .validate, adding the invalidation message(s) with .join('\n') only once.
        //  It adds ZERO performance cost to the most common .validate() case without .invalidate(), and very low cost:
        //  (one defineProperty('validate') per .invalidate(), plus one delete this.validate) to the rather unusual
        //  .invalidate() case. It also prevents performing (potentially multiple) join('\n') of invalidation message
        //  at anytime but on a .validate(). Which helps protecting the logic around ._validationErrorMessage===''
        //
        //  From 'delete' doc : If the property which you are trying to delete does not exist, delete will not have
        delete this.validate;       //  any effect and will return true. It only has an effect on own properties
        //  None of the above is expected to throw so we could have started by delete this.validate.
        return message;
    }

    get isValid() {                                                                         //  === isValidShallow
        return ! this.validate();   //  No error message => true;  Error message => false;
    }

    static FullValidationErrorMessage(validationErrorMessage) {
        return `Invalid ${this.Name} :\n${validationErrorMessage}`;
    }                                             //  'this' is the static This: the class, not the instance.

    get fullValidationErrorMessage() {
        throw new Error(`${this.Name}.prototype.get fullValidationErrorMessage() : Not defined yet. Run ${this.Name}.Setup() !`);
    }

    throwIfInvalid() {
        const validationErrMsg = this.validate();
        if (validationErrMsg) {
            const { _feedOp:feedOp } = this;            //  feedOp may be a pullSingle, pullBundle or pushSingle
            const msgHead = (xtra=> xtra && xtra.msgHead ? ()=>`from ${xtra.msgHead()}\n` : ()=>'')(feedOp._extra);
            throw Object.assign(FeedItemValidation(this.fullValidationErrorMessage, msgHead), {feedOp});
        }
        return this;
    }

    //endregion

    //region *Dst* "interface" { get toDstLitOb(),  async convertToDst(), _setDst(), _setDstSha() }

    /**
     *
     * @returns {Promise<Object>}
     */
    async toDstLitOb() {
        throw Error(`${this.Name}.toDstLitOb() => {} : not implementd by extended class yet. Override me!`);
    }

    get convertErrorMsg() {
        const { Name, tag, _feedOp:feedOp } = this, {fromToTags, tag:feedOpTag} = feedOp;
        const timing = feedOp.pushToDst ? /*instanceof FeedPushSingle*/ 'ahead of' : 'after success of';
        return `Failed performing ${Name}.convertToDst(feedItem[${tag}]) ${fromToTags} syntax ${timing} ${feedOpTag} :`;
    }

    async convertToDst(shaEnumerable=false) {                                       //  Candidate for overriding !
        let dstItem = this._dstJsOb;
        if (! dstItem) {
            try {
                dstItem = this._setDst(await this.toDstLitOb())._dstJsOb;
            }
            catch (e) {
                //  if e.isExpected (.IsFeedOpError in fact), the wrappedError already bears a .feedOp
                //  which will be copied to DstItemCompositionError and exposed.
                //  An !.isExpected Error thrown from unexpected bug in the code won't carry a feedOp and we need one
                //  for the e.stack to be logged. (DstItemCompositionError .isExpected is true but no .feedOp ).
                throw Object.assign(DstItemCompositionError(e), e.feedOp ? {srcItem:this}
                                                                                : {srcItem:this, feedOp:this._feedOp});
            }
        }
        return dstItem.linkFeedItem(this, shaEnumerable);
    }

    /**
     *
     * @param {Object} dstLitOb, a literal Javascript Object.
     * @returns {FeedItem}
     * @private
     */
    _setDst(dstLitOb) {
        this._setDstJsOb(dstLitOb);
        this._setDstJson(JSON.stringify(dstLitOb));
        this._setDstSha(undefined);
        return this;
    }
    _setDstJsOb(ob) {
        Object.defineProperty(this, "_dstJsOb", {configurable: true, value: this.constructor.DstItem(ob)});
    }
    _setDstJson(json) {
        Object.defineProperty(this, '_dstJson', {configurable: true, value: json});
    }
    _setDstSha(dstSha) {
        Object.defineProperty(this, '_dstSha', {configurable: true, value: dstSha});
    }

    //endregion
}
Object.defineProperty(FeedItem, 'DstItem', { get() { return DstItem; }}); //  Overriding candidate !
Object.defineProperty(FeedItem.prototype, 'isValidShallow', Object.getOwnPropertyDescriptor(FeedItem.prototype, 'isValid'));
self.FeedItem = Object.seal(FeedItem);

//region minimalist DstItem

const DstItemProto = {
    /**
     *
     * @param {FeedItem} feedItem
     * @param {boolean} shaEnumerable
     * @returns {DstItem}
     */
    linkFeedItem(feedItem, shaEnumerable=false) {
        if (this._feedItem) {
            return this;
        }
        Object.defineProperty(this, '_feedItem', {value: feedItem});

        const { _dstJson } = feedItem;
        Object.defineProperty(this, '_json', {get() { return _dstJson}});

        // withShaEnumerable specifies if the (always available) .sha property will be included in JSON or not.
        return Object.defineProperty(this, 'sha', {enumerable: shaEnumerable, get() {
                let sha = feedItem._dstSha;     //  undefined on construction and on every FeedItem._setDst() call.
                if (undefined === sha) {        //  late computation, cached locally.
                    sha = sha256(_dstJson);
                    feedItem._setDstSha(sha);
                }
                return sha;
            }});
    },
    get tag() { return this._feedItem.tag; },
    toString() { return this._json; },                                          //  Candidate for overriding !
};
function DstItem(dstLitOb) {
    const o = Object.create(DstItemProto);
    Object.assign(o, dstLitOb);
    return o;
}
(self.DstItem = DstItem).chainProto();
self.DstItemExtProto = ()=>Object.create(DstItemProto);                 // to extend DstItem

const DstBundleProto = {
    toString() {  return niceJSON(this); //  todo Replace the feedItems in results:[] by their own maybe overriden toString.
        // const emptyBundle = niceJSON(DstBundle(this));  //  results:[]
        // emptyBundle.replace(/(results\s*:\s*\[\s*)(.*?)(\s*\]\s*\}$)/,)
    }                                                                               //  Candidate for overriding !
};
function DstBundle({offset, hasMore}) {
    const o = Object.create(DstBundleProto);
    Object.assign(o, {offset, hasMore, results:[]});
    return o;
}
(self.DstBundle = DstBundle).chainProto(DstBundleProto);

//endregion

//endregion


logger.trace("Initialized ...");
