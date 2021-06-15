/**
 * © Copyright Portable EHR inc, 2021
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { Enum, EItem, expectedErrorProtoDefaultProps, } = require('../../nodeCore/lib/utils');
const { IpSocketError, StatusError, Unpacking, FeedHubError, SelfStatusErrorBody } = require('../../nodeCore/lib/nao');

//region Feed, FeedHub and Backend ApiResponse   from lib/api

const { EFeedRequestStatus, FeedApiResponse, EFeedHubRequestStatus,  } = require('../../nodeCore/lib/api');

const {
    // OK:                     eFeedRequestStatusOk,
    INTERNAL:               eFeedRequestStatusInternal,
    // INVALID_COMMAND:        eFeedRequestStatusInvalidCommand,
    // INVALID_PARAMETERS:     eFeedRequestStatusInvalidParameters,
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
    INVALID_COMMAND:        eFeedHubRequestStatusInvalidCommand,
    INVALID_PARAMETERS:     eFeedHubRequestStatusInvalidParameters,
    MALFORMED:              eFeedHubRequestStatusMalformed,
    BACKEND:                eFeedHubRequestStatusBackend,
    // AUTH:                   eFeedHubRequestStatusAuth,
    // ACCESS:                 eFeedHubRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedHubRequestStatusCriteriaNotFound,
    NOT_FOUND:              eFeedHubRequestStatusNotFound,
    // UNREACHABLE:            eFeedHubRequestStatusUnreachable,  //  Normally for patient etc. Also used by ping here.
    // TRANSPORT:              eFeedHubRequestStatusTransport,
} = EFeedHubRequestStatus;

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
    eFeedRequestStatus: {writable:true, value: function() { //  this.statusCode is undefined except for StatusError.
        return this.feedOp.eFeedRequestStatusForError(createdConstructor.name, this.statusCode); }},

    //  This object assigned to constructor.BuildErrorProtoProps MAY return getter/setter props, as long
    //  as these are not intended to be overwritten by Object.assigned constructor.ErrorAssignedProto.
    isTransportError:           { get() {
        // noinspection JSUnresolvedFunction
        return eFeedRequestStatusTransport === this.eFeedRequestStatus();
    }},
    isBackendMaintenanceError:  { get() {   //  This only return a potential true on a FeedHubError with .feedHubApiRequestStatus prop.
        const { feedHubApiRequestStatus: { status, message }={} } = this;
        return eFeedHubRequestStatusBackend.name === status  &&  message  &&  message.match(/:\s+\[MAINTENANCE\]/);
    }},
});

const DeclareFeedOpError = (constructor, feedOpErrorAssignedProto={}) => {
    constructor.BuildErrorProtoProps = feedOpErrorProtoDefaultProps;
    constructor.ErrorAssignedProto = feedOpErrorAssignedProto;
};

//  Overrides DeclareExpectedError() of [IpSocketError, StatusError, Unpacking, FeedHubError] with DeclareFeedOpError()

DeclareFeedOpError(IpSocketError, {
    shortMessage() {
        return (({feedOp})=>`${this.message}${feedOp.isOfFeed ? ' '+this.msgHead() : ''}`)(this); },
});

DeclareFeedOpError(StatusError, {
    eFeedRequestStatus() {
        return this.feedOp.eFeedRequestStatusForError(StatusError.name, this.statusCode); },
    shortMessage() {
        const { feedOp:{isOfFeed}, msgHead, message, body=SelfStatusErrorBody()} = this;  //  cut the '\n'
        return `${message}${body.body? ` [${body.expose()}]` :''}${isOfFeed ? ' '+msgHead().slice(0,-1) : ''}`; },

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

DeclareFeedOpError(FeedHubError, {
    eFeedRequestStatus() {
        return this.feedOp.eFeedRequestStatusForError(FeedHubError.name, this.feedHubApiRequestStatus.status); },
    shortMessage() {
        return this.message; },
    logMessage({verbose=false}) {   //  that's the pump.verbose
        const {feedOp, }=this;
        verbose = verbose || feedOp.isApiWebOpVerbose || feedOp.verboseEndpoint;

        const {isFeedItemLogged, isUriLogged} = feedOp.isLoggedForError(FeedHubError.name, this.feedHubApiRequestStatus.status);
        const items =  (isFeedItemLogged || verbose)  ?  feedOp.srcAndDstItemStrs.join('')  :  '';

        return items + (isUriLogged ? (items ? '.'  : '') + this.verboseMsg
                                    : (items ? '\n' : '') + this.message   );
    },
});

//  Now that they've been made FeedOp errors, own them all.
Object.assign(self, {IpSocketError, StatusError, Unpacking, FeedHubError});

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
const unexpectedErrorStatus = ()=> eFeedRequestStatusInternal;
const   expectedErrorStatus = e => {
    try {       return e.eFeedRequestStatus();                        }
    catch (e) {
        return unexpectedErrorStatus();   }
};
self.  expectedErrorLogMessage   =   expectedErrorLogMessage;
self.unexpectedErrorShortMessage = unexpectedErrorShortMessage;
self.  expectedErrorShortMessage =   expectedErrorShortMessage;
self.  expectedErrorStatus       =   expectedErrorStatus;

//endregion


self.logFeedOpCall = async (feedOpCallPromise, logger, verbose=false) => {
    try {
        const res = await feedOpCallPromise,
            { _feedOp } = res;

        logger.info(_feedOp ? `Performed ${_feedOp.tag} ${_feedOp.fromToTags} :\n${JSON.stringify(res)}`
                            : JSON.stringify(res))
    }
    catch(e) {
        logger.error(e.feedOp ? e.feedOp.logMsgForError(e, verbose) :
                     e.isExpected ? expectedErrorLogMessage(e, verbose) : e.stack);
    }
};


//region FeedOp

const getThisParamsId = function() { return this.params.feedItemId; };
class FeedOp {
    constructor(feed) {
        if (feed) {
            Object.defineProperty(this, 'feed', {value:feed});
        }
        this.endpoint = this._getEndpoint();
    }

    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }

    get feed() {      return {};    }                                               //  candidate for overriding
    get feedAlias() {    return this.feed.alias; }
    get verboseEndpoint() { return this.feed.verbose; }

    get isApiSuccessVerbose(){ return false; }                                      //  Both candidates for overriding
    get isApiWebOpVerbose()  { return false; }          //  WebOp is the web operation part of FeedOp (vs convert).

    get FeedProviderName() { return this.endpoint.feedProviderName; }                       //  candidate for overriding
    get feedTag() { return `${this.FeedProviderName} ${this.feed.fullTag}`; }
    get isOfFeed() { throw new Error(`${this.Name}.prototype.get isOfFeed() : Not defined yet. Override me !`); }   // either .isFromFeed (pull) or .isToFeed (push) or directly .isOfFeed (retire)
    get ofTags() { return this.isOfFeed ? [this.feedTag , 'FeedHub'] : ['FeedHub', this.feedTag] ; }
    get isToFeed() { return undefined; }            //  SMALL HACK: isToFeed is defined in a push, isFromFeed in a pull.
    get fromToTags() {                                                                  //  candidate for overriding
        const {ofTags:[pullSrcTag, pullDstTag]}=this;// SMALL HACK: isToFeed is defined in a push, isFromFeed in a pull.
        const [srcTag, dstTag] = undefined===this.isToFeed ? [pullSrcTag, pullDstTag] : [pullDstTag, pullSrcTag];
        return `from ${srcTag} to ${dstTag}`;
    }
    // noinspection JSUnusedGlobalSymbols           //  SMALL HACK: isToFeed is defined in a push, isFromFeed in a pull.
    get toTag() { return (!this.isOfFeed) !== (undefined===this.isToFeed)  ? 'FeedHub' : `${this.FeedProviderName} Feed`; }// XOR
    get tag() {  throw new Error(`${this.Name}.prototype.get tag() : Not defined yet. Override me !`); }
    get _errorMsg() { return `Failed performing ${this.tag} ${this.fromToTags} :`; }    //  candidate for overriding
    logMessage(/*e*/) { return this._errorMsg; }
    get feedItemId() {  throw new Error(`${this.Name}.prototype.get feedItemId() : Not defined yet. Run ${this.Name}.Setup() !`); }

    _getEndpoint() { throw new Error(`${this.Name}.prototype._getEndpoint() : Not defined yet. Run ${this.Name}.Setup() !`);}
    _getFeedEndpoint() { throw new Error(`${this.Name}.prototype._getFeedEndpoint() : Not defined yet. Run ${this.Name}.Setup() !`);}
    _getFeedHubEndpoint() { return this.feed.feedHubEndpoint;}

    //  "generic" (eDirection-independent) version.
    _handleError(e) {
        throw Object.assign(e, {feedOp:this});
    }
    _handleFeedError(e) { throw new Error(`${this.Name}.prototype._handleFeedError(e[${e}]) : Override me !`);}

    //region API error handling

    isLoggedForFeedError(ErrorConstructorName, extraCriteria) { throw new Error(`${this.Name}.prototype.isLoggedForFeedError(ErrorConstructorName[${ErrorConstructorName}, extraCriteria[${extraCriteria}]) : Not defined yet. Override me !`); }
    isLoggedForError(ErrorConstructorName, extraCriteria) { throw new Error(`${this.Name}.prototype.isLoggedForError(ErrorConstructorName[${ErrorConstructorName}, extraCriteria[${extraCriteria}]) : Not defined yet. Run ${this.Name}.Setup() !`); }

    eFeedRequestStatusForFeedError(ErrorConstructorName, extraCriteria) { throw new Error(`${this.Name}.prototype.eFeedRequestStatusForFeedError(ErrorConstructorName[${ErrorConstructorName}, extraCriteria[${extraCriteria}]) : Not defined yet. Override me !`); }
    eFeedRequestStatusForError(ErrorConstructorName, extraCriteria) { throw new Error(`${this.Name}.prototype.eFeedRequestStatusForError(ErrorConstructorName[${ErrorConstructorName}, extraCriteria[${extraCriteria}]) : Not defined yet. Run ${this.Name}.Setup() !`); }

    get srcAndDstItemStrs() { return ['', ''];}

    //  "generic" (eDirection-independent) version.
    handleApiError(e) {
        return e.isExpected ? { logMsg: this.logMessage(e) + '\n' +   expectedErrorLogMessage(e),
                                ownApiResponse:FeedApiResponse({status:   expectedErrorStatus(e),
                                                                message:  expectedErrorShortMessage(e)})  }
                            : { logMsg: this.logMessage(e) + '\n' + unexpectedErrorLogMessage(e, this),
                                ownApiResponse:FeedApiResponse({status: unexpectedErrorStatus( ),
                                                                message:unexpectedErrorShortMessage(e)})  };
    }
    handleApiFeedError(e) { throw new Error(`${this.Name}.prototype.handleApiFeedError(e[${e}]) : Not defined yet. Override me !`); }

    logMsgForError(e, verbose=false) {
        return this.logMessage(e) + '\n' + (e.isExpected  ?    expectedErrorLogMessage(e, verbose)
                                                          :  unexpectedErrorLogMessage(e, this));
    }
    logMsgForFeedError(e, verbose=false) { throw new Error(`${this.Name}.prototype.logMsgForFeedError(e[${e}], verbose[${verbose}]) : Not defined yet. Override me !`); }

    //endregion
                                // fits FeedPullSingle and FeedRetireSingle
    static get getFeedItemId() { return getThisParamsId; }                          //  Candidate for overriding !
    static get path() { return ''; }
    static get command() { return ''; }
    // noinspection JSUnusedGlobalSymbols
    get eDirection() { throw new Error(`${this.Name}.eDirection : Not defined yet. Run ${this.Name}.Setup() !`);}
    get path() {    return this._path;    }                         //  defined in .Setup() from static get path().
    get command() { throw new Error(`${this.Name}.command : Not defined yet. Run ${this.Name}.Setup() !`); } //  defined in .Setup() from static get command().
    static get FeedProviderFullTag() { return `FeedProvider [] version []`; }
    static SetupFeedHub(baseProto, {eDirection, isOfFeed=false}) {
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
        const thisProto = This.prototype;

        Object.defineProperty(This, 'eDirection', {value: eDirection});
        Object.defineProperty(thisProto, 'eDirection', {value: eDirection});
        Object.defineProperty(thisProto, 'isOfFeed', {value:isOfFeed});
        Object.defineProperty(thisProto, '_path', {value: This.path});
        Object.defineProperty(thisProto, 'command', {value: This.command});
        Object.defineProperty(thisProto, 'feedItemId', {configurable: true, get: This.getFeedItemId});  //  Candidate for overriding ! (by PullBundle notably)

        thisProto._getEndpoint = isOfFeed  ?  thisProto._getFeedEndpoint
                                           :  thisProto._getFeedHubEndpoint;

        baseProto._handleFeedHubError = baseProto._handleError;
        thisProto._handleError = isOfFeed  ?  thisProto._handleFeedError
                                           :  thisProto._handleFeedHubError;

        // Could've been a static function : 'this' is not used once. It's defined in prototype for calling convenience.
        baseProto.isLoggedForFeedHubError = (ErrorConstructorName, extraCriteria) => (
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
                    [eFeedHubRequestStatusMalformed]        : {isFeedItemLogged:true,  isUriLogged:true },
                    [eFeedHubRequestStatusInvalidCommand]   : {isFeedItemLogged:false, isUriLogged:true },
                    [eFeedHubRequestStatusInternal]         : {isFeedItemLogged:true,  isUriLogged:true },
                    [eFeedHubRequestStatusInvalidParameters]: {isFeedItemLogged:true,  isUriLogged:false},
                    [eFeedHubRequestStatusNotFound]         : {isFeedItemLogged:true,  isUriLogged:false},

                    //  The following get the Default               {isFeedItemLogged:false,  isUriLogged:false}

                    // eFeedHubRequestStatusAccess,     // privileges, read-write permissions, the like.  200 NO_ACCESS
                    // eFeedHubRequestStatusAuth,                   // bad apiKey, deviceGuid, userGuid 200 AUTH_FAILED
                    // eFeedHubRequestStatusUnreachable             //  not ping Reachable.

                }[eFeedHubStatus])                                                      //  Default value for the rest
            }[ErrorConstructorName]   //  The ErrorConstructorName directly selects a second layer selection function
        );
        thisProto.isLoggedForError = isOfFeed ? thisProto.isLoggedForFeedError
                                              : thisProto.isLoggedForFeedHubError;

        // Could've been a static function : 'this' is not used once. It's defined in prototype for calling convenience.
        baseProto.eFeedRequestStatusForFeedHubError=(ErrorConstructorName, extraCriteria)=>(//  extraCriteria is statusCode
                (result=eFeedRequestStatusInternal) =>  // eFeedHubRequestStatusInternal if ErrorConstructor's not covered here
                    EFeedRequestStatus[result] ? result                 //  return result if it's a EFeedRequestStatus
                                               : result(extraCriteria)  //  otherwise it's the function(statusCode) of StatusError
            )({
                [IpSocketError.name]      : eFeedRequestStatusTransport,
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

                    //  The feedHub generates a 500 on any un-handled error thrown: it's a code maintainer mistake to fix.
                    (statusCode === 500) ?                                           eFeedRequestStatusFeedHub   :  // [500:501]

                    //  000: Internal endpoint._webRequest  maxAttempts=0 error.  Unlikely. Internal yet expected !
                    (statusCode < 100) ?                                             eFeedRequestStatusInternal  :  // [   :100]

                    //  This covers all feedHub auth/NotFound/Malformed related issues: SHOULD NEVER happen (except 404)
                    //  (400 =< statusCode  || statusCode < 500)    //  answered with 200 OK and a FeedHubApiResponse.eStatus
                                                                                     eFeedRequestStatusFeedHub  ),  // [400:500]
                [FeedHubError.name]       : status => (
                                            status === eFeedHubRequestStatusBackend.name  ?  eFeedRequestStatusBackend
                                                                                          :  eFeedRequestStatusFeedHub),
                [Unpacking.name]          : eFeedRequestStatusFeedHub,  //  Apache responds with html rather than node with JSON: same as 500
            }[ErrorConstructorName]   //  The ErrorConstructorName directly selects eStatus or StatusError function(statusCode)
        );
        thisProto.eFeedRequestStatusForError = isOfFeed ? thisProto.eFeedRequestStatusForFeedError
                                                        : thisProto.eFeedRequestStatusForFeedHubError;

        baseProto.handleApiFeedHubError = baseProto.handleApiError;
        thisProto.handleApiError = isOfFeed  ?  thisProto.handleApiFeedError
                                             :  thisProto.handleApiFeedHubError;

        baseProto.logMsgForFeedHubError = baseProto.logMsgForError;
        thisProto.logMsgForError = isOfFeed  ?  thisProto.logMsgForFeedError
                                             :  thisProto.logMsgForFeedHubError;

       return This;
    }
}
self.FeedOp = FeedOp;

//endregion


logger.trace("Initialized ...");
