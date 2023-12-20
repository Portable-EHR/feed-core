/*
 * Copyright © Portable EHR inc, 2021
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { NoRow, } = require('../../nodecore/lib/dao');
const { dbMsg, ErrorExtender, DeclareExpectedError, } = require('../../nodecore/lib/utils');
const { EFeedRequestStatus, BuildFeedApiResponse, } = require('../../nodecore/lib/api');
const {
    // OK:                     eFeedRequestStatusOk,
    INTERNAL:               eFeedRequestStatusInternal,
    // INVALID_COMMAND:        eFeedRequestStatusInvalidCommand,
    // INVALID_PARAMETERS:     eFeedRequestStatusInvalidParameters,
    // MALFORMED:              eFeedRequestStatusMalformed,
    // BACKEND:                eFeedRequestStatusBackend,
    // AUTH:                   eFeedRequestStatusAuth,
    // ACCESS:                 eFeedRequestStatusAccess,
    // CRITERIA_NOT_FOUND:     eFeedRequestStatusCriteriaNotFound,
    NOT_FOUND:              eFeedRequestStatusNotFound,
    // UNREACHABLE:            eFeedRequestStatusUnreachable,  //  Used by ping here.
    // TRANSPORT:              eFeedRequestStatusTransport,
    // FEEDHUB:                eFeedRequestStatusFeedHub,
} = EFeedRequestStatus;


const self = module.exports;


//region Errors

function EnumError(message, recEnum) {
    return ErrorExtender(message, EnumError, {recEnum});
}
DeclareExpectedError(self.EnumError = EnumError);

function CantBeNull(message) {
    return ErrorExtender(message, CantBeNull);
}
DeclareExpectedError(self.CantBeNull = CantBeNull);

function WrongType(message) { return ErrorExtender(message, WrongType); }
DeclareExpectedError(self.WrongType = WrongType);

function NotFound(message) {
    return ErrorExtender(message, NotFound);
}
DeclareExpectedError(self.NotFound = NotFound);

function Validation(message, validationErrors) {
    return ErrorExtender(message, Validation, {validationErrors});
}
DeclareExpectedError(self.Validation = Validation);

function Conflict(message, conflictErrors) {
    return ErrorExtender(message, Conflict, {conflictErrors});
}
DeclareExpectedError(self.Conflict = Conflict);


self.handleApiError = (e, msg) => {
    if (e instanceof NoRow) {
        const { message } = e;
        e.feedOp = {
            handleApiError: e =>
                ({ logMsg           : `${e.message} ${msg}`,
                    ownApiResponse  : BuildFeedApiResponse({status: eFeedRequestStatusNotFound, message}) }),
        };
    }
    else if (e.sql) {
        e.feedOp = {
            handleApiError: e =>
                ({ logMsg           : `${msg} : ${dbMsg(e)}`,
                    ownApiResponse  : BuildFeedApiResponse({ status  : eFeedRequestStatusInternal,
                                                        message : `sql error ${msg}`            }), }),
        };
    }

    throw e;
};

//endregion


logger.trace("Initialized ...");
