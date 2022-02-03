/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { dbMsg, Enum, EItem } = require('../../nodecore/lib/utils');
const { dbInsert, dbUpdate, dbDelete, fetchFromDb } = require('../../nodecore/lib/my-dao');
const { FeedRecord, FeedItemRecord, RecordJoined, Referenced, MultiOwned, OnlyInserted, InsertAndUpdated,
        Validation, } = require('./my-dao');

const { PractitionerRecord } = require('./my-dao.practitioner');
const { PatientRecord } = require('./my-dao.patient');


const self = module.exports;

class PrivateMessageAttachmentJoined extends RecordJoined {}
class PrivateMessageAttachmentRecord extends FeedRecord {
    #message_id;
    #feed_item_id;
    #name;
    #original_creation;
    #mime_type;
    #doc_as_b64;
    static get TableName() { return 'PrivateMessageAttachment'; }
    static get Joined() { return new PrivateMessageAttachmentJoined(this); }

    constructor({id, row_version, row_created, row_persisted, message_id, feed_item_id, backend_item_id, name, original_creation, mime_type, doc_as_b64}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#message_id = message_id;
        this.#feed_item_id = feed_item_id;
        this.#name = name;
        this.#original_creation = original_creation;
        this.#mime_type = mime_type;
        this.#doc_as_b64 = doc_as_b64;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ backend_item_id,  });
        // Object.assign(this, { backend_item_id });
    }

    //region The get/set "interface": {  message_id, name, original_creation, originalCreation, mime_type, mimeType, doc_as_b64, docAsB64, ... }

    // noinspection JSUnusedGlobalSymbols
    get message_id() { return this.#message_id; }
    get messageId() { return this.#message_id; }
    // noinspection JSUnusedGlobalSymbols
    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }

    // noinspection JSUnusedGlobalSymbols
    get backendItemId() { throw Error(`${this.Name}.prototype.get backendItemId() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set backendItemId(value) { throw Error(`${this.Name}.prototype.set backendItemId(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get name() { return this.#name; }

    // noinspection JSUnusedGlobalSymbols
    get original_creation() { return this.#original_creation; }
    get originalCreation() { return this.#original_creation; }

    // noinspection JSUnusedGlobalSymbols
    get mime_type() { return this.#mime_type; }
    get mimeType() { return this.#mime_type; }

    // noinspection JSUnusedGlobalSymbols
    get doc_as_b64() { return this.#doc_as_b64; }
    get docAsB64() { return this.#doc_as_b64; }

    //endregion

    //region litOb

    toOwnLitOb() {
        const {  messageId, feedItemId, backendItemId, name, originalCreation, mimeType, docAsB64 } = this;
        return { messageId, feedItemId, backendItemId, name, originalCreation, mimeType, docAsB64 };
    }

    toApiLitOb() {
        const {  feedItemId, backendItemId, name, originalCreation, mimeType, docAsB64 } = this;
        return { feedItemId, backendItemId, name, originalCreation, mimeType, docAsB64 };
    }

    //  Being MultiOwned by PractitionerRecord, PractitionerLegitIdRecord must implement MultiOwned "interface" :
    //
    //      toOwnerApiLitOb() {}
    //      static FromOwnedApiLitOb(litOb) {}

    //  How the FeedRecord is LitOb-ed when embedded in its owner.
    toOwnerApiLitOb(apiLitOb={}) {
        const { name, originalCreation, mimeType, docAsB64 } = this;
        return {                                                                //  todo change this Backend format ?
            name: name ? name : null,
            date: originalCreation,
            mimeType,     //  ext is anything following a potential / in mimeType, undefined otherwise.
            ext:(ext => ext ? ext : undefined)('string' === typeof mimeType ? mimeType.replace(/([^\/]*)\/?/, '') : ''),
            docAsB64,
            ...apiLitOb,
        }
    }

    static FromOwnedApiLitOb(ownedApiLitOb, nativeLitOb) {
        const { feedItemId, backendItemId, name, date, mimeType, docAsB64 } = ownedApiLitOb;
        return {                                                                //  todo change this Backend format ?
            feedItemId,                 //  Neither feedItemId
            backendItemId,              //  Not backendItemId are likely present.
            name,
            originalCreation: date,
            mimeType,
            docAsB64,
            ...nativeLitOb
        };
    }

    //endregion

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwner of
        //  a .Joined MultiOwned() entry.  Editing is rather done via .whatever object.
        message_id(       colName) {        return OnlyInserted({colName,                             }); },
        feed_item_id(     colName) {        return OnlyInserted({colName, recName:'feedItemId',       }); },
        name(             colName) {        return OnlyInserted({colName,                             }); },
        original_creation(colName) {        return OnlyInserted({colName, recName:'originalCreation', }); },
        mime_type(        colName) {        return OnlyInserted({colName, recName:'mimeType',         }); },
        doc_as_b64(       colName) {        return OnlyInserted({colName, recName:'docAsB64',         }); },

        backend_item_id(  colName) {    return InsertAndUpdated({colName, recName:'backendItemId',  }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{backendItemId: string|null|undefined, name: string|null|undefined,
     *          originalCreation: string|null|undefined, mimeType: string, docAsB64: string|null|undefined, }} srcOb
     * @param {Error[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<PractitionerLegitIdRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {
        const { originalCreation=null, docAsB64=null, } = srcOb;
        console.log({srcOb1:srcOb})
        Object.assign(srcOb, {
            originalCreation:   originalCreation === null  ?  new Date()  :  originalCreation,  //  if was undefined or null
            docAsB64:                   docAsB64 === null  ?  ""          :  docAsB64,          //  if was undefined or null
        });
        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.PrivateMessageAttachmentRecord = PrivateMessageAttachmentRecord).Setup();


class PrivateMessageJoined extends RecordJoined {
    // noinspection JSUnusedGlobalSymbols
    feedPractitionerId(joinName) { return Referenced({joinName, FeedRecord:PractitionerRecord, referencePropertyName:'practitioner', referenceIdLitObName:'physicianId' }); }
    // noinspection JSUnusedGlobalSymbols
    feedPatientId(     joinName) { return Referenced({joinName, FeedRecord:PatientRecord, referencePropertyName:'patient', referenceIdLitObName:'patientId', }); }

    // noinspection JSUnusedGlobalSymbols
    attachments(       joinName) { return MultiOwned({joinName, FeedRecord:PrivateMessageAttachmentRecord}); }
}
class PrivateMessageRecord extends FeedItemRecord {
    #attachments = [];

    #practitioner_id;
    #patient_id;
    #message_context;
    #subject;
    #text;
    static get TableName() { return 'PrivateMessage'; }
    static get Joined() { return new PrivateMessageJoined(this); }



    static FromOwnedApiLitOb(ownedApiLitOb) {
        consosle.log('called')
        const { practitioner_id, patient_id } = ownedApiLitOb;
        return {                                                                //  todo change this Backend format ?
           practitioner_id,
           patient_id
        };
    }
    // noinspection DuplicatedCode
    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                                                practitioner_id, patient_id, message_context, subject, text}) {


                                                

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});

        this.#practitioner_id = practitioner_id;
        this.#patient_id = patient_id;
        this.#message_context = message_context;
        this.#subject = subject;
        this.#text = text;

        // this._setMostRecentKnownPersistedRowOwnUpdatableValues(({ }));
        // Object.assign(this, { });
    }

    //region The get/set "interface": {  practitionerId, patientId, messageContext, subject, text ... }

    // noinspection JSUnusedGlobalSymbols
    get practitioner_id() { return this.#practitioner_id; }
    get practitionerId()  { return this.#practitioner_id; }

    // noinspection JSUnusedGlobalSymbols
    get patient_id() { return this.#patient_id; }
    get patientId()  { return this.#patient_id; }

    // noinspection JSUnusedGlobalSymbols
    get message_context() { return this.#message_context; }
    get messageContext()  { return this.#message_context; }

    get subject() { return this.#subject; }

    get text() { return this.#text; }


    // ===================================================

    //  Referenced

    // noinspection JSUnusedGlobalSymbols
    get feedPractitionerId() { throw Error(`${this.Name}.prototype.get feedPractitionerId() : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get feedPatientId() { throw Error(`${this.Name}.prototype.get feedPatientId() : Not defined yet. Run ${this.Name}.Setup().`); }

    //  MultiOwned

    // noinspection JSUnusedGlobalSymbols
    get attachments() { return this.#attachments; }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  practitionerId, patientId, messageContext, subject, text } = this;
        return { practitionerId, patientId, messageContext, subject, text };
    }

    toNonRetiredApiLitOb(apiLitOb={}) {
        const { rowCreated, feedItemId, messageContext, subject, text,  } = this;

        return super.toNonRetiredApiLitOb({
            messageContext: messageContext ? messageContext : "",             // todo change "" to null Incident #26,
            subject       : subject        ? subject        : null,
            text          : text           ? text           : "",             // todo change "" to null Incident #26

            dateCreated: rowCreated,
            messageId: feedItemId,
            // patientId,
            // physicianId,

            ...apiLitOb
        });
    }

    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const { messageContext, subject, text, } = apiLitOb;

        return super.FromNonRetiredApiLitOb(apiLitOb, {
            messageContext: messageContext ? messageContext : undefined,        //  null, "" => undefined
            subject       : subject        ? subject        : undefined,        //  null, "" => undefined
            text          : text           ? text           : undefined,        //  null, "" => undefined
            ...nativeLitOb,
        });
    }

    //endregion

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        message_context(colName) {  return OnlyInserted({colName, recName:'messageContext', }); },
        subject(        colName) {  return OnlyInserted({colName,                           }); },
        text(           colName) {  return OnlyInserted({colName,                           }); },

        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwned|
        //  Owner of a .Joined UniOwned() entry, or as .colNameJoiningToReferenced of a
        //  .Joined Referenced() entry.  Editing is rather done via .whatever object.
        practitioner_id(colName) {  return OnlyInserted({colName,   }); },
        patient_id(     colName) {  return OnlyInserted({colName,   }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{feedAlias: string, feedItemId: string|null|undefined, backendItemId: string|null|undefined,
     *          messageContext: string|null|undefined, subject: string|null|undefined, text: string|null|undefined,
     *          feedPractitionerId: string, feedPatientId: string,
     *          attachments:{backendItemId: string|null|undefined, name: string|null|undefined,
     *              originalCreation: string|null|undefined, mimeType: string, docAsB64: string, }[]|null|undefined,
     *          }} srcOb
     * @param {Error[]} validationErrors
     * @returns {Promise<PractitionerRecord>}
     * @constructor
     */


     static async DaoPullBundle({srcOb}) {
        
        const results =await fetchFromDb(`SELECT Patient.first_name as 'p_f_name',
        Patient.family_name as 'p_l_name', 
        Practitioner.first_name as 'd_f_name', 
        Practitioner.family_name as 'd_l_name',
        PrivateMessage.*
        from PrivateMessage Join Patient on PrivateMessage.patient_id=Patient.id join Practitioner on PrivateMessage.practitioner_id=Practitioner.id;`);
     
       return {results}
    }
    static async Insert({srcOb, validationErrors=[]}) {
        
        try {
            //return await super.Insert({srcOb, validationErrors});
            const _res1=await super.Insert({srcOb, validationErrors});
            console.log({_res1});
            return _res1;

        } catch (error) {
            return error;
        }
        
    }


}
(self.PrivateMessageRecord = PrivateMessageRecord).Setup();


class PrivateMessageContentRecord extends PrivateMessageRecord {
    toNonRetiredApiLitOb(apiLitOb = {}) {

        const {  messageContext, subject, text, attachments, } = super.toNonRetiredApiLitOb(apiLitOb);

        return { messageContext, subject, text, attachments, };
    }
}
(self.PrivateMessageContentRecord = PrivateMessageContentRecord).Setup();


//region EPrivateMessageStatus

const EPrivateMessageStatus = (f=>{f.prototype=new Enum(f); return new f({});})(function EPrivateMessageStatus({
    received    =(f=>f(f))(function received(f)    { return EItem(EPrivateMessageStatus, f); }),
    notified    =(f=>f(f))(function notified(f)    { return EItem(EPrivateMessageStatus, f); }),
    sent        =(f=>f(f))(function sent(f)        { return EItem(EPrivateMessageStatus, f); }),
    reminded    =(f=>f(f))(function reminded(f)    { return EItem(EPrivateMessageStatus, f); }),
    fallback    =(f=>f(f))(function fallback(f)    { return EItem(EPrivateMessageStatus, f); }),
    failed      =(f=>f(f))(function failed(f)      { return EItem(EPrivateMessageStatus, f); }),
    acknowledged=(f=>f(f))(function acknowledged(f){ return EItem(EPrivateMessageStatus, f); }),
    seen        =(f=>f(f))(function seen(f)        { return EItem(EPrivateMessageStatus, f); }),
}) { Enum.call(Object.assign(this, {received, notified, sent, reminded, fallback, failed, acknowledged, seen})); });
self.EPrivateMessageStatus = EPrivateMessageStatus;
const {
    received:       ePrivateMessageReceived,
    notified:       ePrivateMessageNotified,
    sent:           ePrivateMessageSent,
    reminded:       ePrivateMessageReminded,
    fallback:       ePrivateMessagefallback,
    failed:         ePrivateMessageFailed,
    acknowledged:   ePrivateMessageAcknowledged,
    seen:           ePrivateMessageSeen,
} = EPrivateMessageStatus;
[ePrivateMessageReceived, ePrivateMessageNotified, ePrivateMessageSent, ePrivateMessageReminded, ePrivateMessagefallback,
 ePrivateMessageFailed, ePrivateMessageAcknowledged, ePrivateMessageSeen, ].join();   //  Kludge to prevent stupid 'unused' warnings.

//endregion

class PrivateMessageStatusJoined extends RecordJoined {}
class PrivateMessageStatusRecord extends FeedRecord {
    #feed_item_id;
    static get TableName() { return 'PrivateMessage'; }
    static get uuidDbName() { return 'feed_item_id'; }
    static get Joined() { return new PrivateMessageStatusJoined(this); }

    constructor({feed_item_id, status, ...id__row_version__row_created__row_persisted__row_retired}) {

        super(id__row_version__row_created__row_persisted__row_retired);
        this.#feed_item_id = feed_item_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ status, });
        // Object.assign(this, { status, });
    }

    //region The get/set "interface": {  feedItemId, eStatus ... }

    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }

    get eStatus() { throw Error(`${this.Name}.prototype.get eStatus() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set eStatus(value) { throw Error(`${this.Name}.prototype.set eStatus(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  feedItemId, eStatus, } = this;

        return { feedItemId, eStatus, };
    }

    toNonRetiredApiLitOb(apiLitOb={}) {
        const {  feedItemId, eStatus, } = this;

        return {
            messageId: feedItemId,
            status: eStatus,
            ...apiLitOb
        };
    }

    static FromNonRetiredApiLitOb(apiLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()
        const {
            messageId: feedItemId,
            status: eStatus,
        } = apiLitOb;

        return { feedItemId, eStatus, };
    }   //  apiLitOb is not cleaned up afterward.

    //endregion

    static _OwnFields = {
        feed_item_id(colName) {      return OnlyInserted({colName, recName:'feedItemId',                    }); },

        status(      colName) {  return InsertAndUpdated({colName, recName:'eStatus',    recEnum:EPrivateMessageStatus, }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{}} srcOb
     * @param {Error[]} validationErrors
     * @returns {Promise<PrivateMessageStatusRecord>}
     * @constructor
     */
    
    static async Insert({srcOb, validationErrors=[]}) {
        validationErrors.push(Error(`Insert of ${this.FeedItemName} is not supported.`));
        throw Validation(`Inserting ${this.FeedItemName} :\n${validationErrors.join('\n')}`, validationErrors);
    }

    /**
     *
     * @param {{feedItemId: string, eStatus: string|EPrivateMessageStatus,}} nativeSrcOb
     * @param {Error[]} validationErrors
     * @param {string[]} conflicts
     * @param {function} _dbInsert
     * @param {function} _dbUpdate
     * @param {function} _dbDelete
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @return {Promise<PrivateMessageStatusRecord>}
     */
    async updateWithCandidate(nativeSrcOb, {validationErrors=[], conflicts=[], _dbInsert=dbInsert, _dbUpdate=dbUpdate,
                                                        _dbDelete=dbDelete, _fetchFromDb=fetchFromDb, trans=null}={}) {
        return await super.updateWithCandidate(nativeSrcOb, { validationErrors, conflicts, _dbInsert, _dbUpdate,
                                                                                _dbDelete, _fetchFromDb, trans});
    }

}





const { DaoPushSingle, GetByUuid, } = FeedItemRecord;
Object.assign(PrivateMessageStatusRecord, { DaoPushSingle, GetByUuid, }) ;
(self.PrivateMessageStatusRecord = PrivateMessageStatusRecord).Setup();








if ([false, true][ 0 ]) {
    let feedPractitionerId, feedPatientId;
    const docFirstName = ['Luc', 'Marc'][ 0 ];
    const phoneNumber = ['(327) 384-1906','1-555-222-3333'][ 1 ];

    PractitionerRecord.GetWithCriteria('WHERE first_name = ?', [docFirstName]
    ).then(records => {
        if (records.length) {
            feedPractitionerId = records[0].feedItemId;

            PatientRecord.GetByPhoneNumber(phoneNumber
            ).then(records => {
                if (records.length) {
                    feedPatientId = records[0].feedItemId;
                    const { docAsB64 } = require('../exam73.json');

                    for (let privMsgLitOb of [{
                        feedAlias: 'fiktivDP',
                        feedPractitionerId,
                        feedPatientId,
                        messageContext : null,
                        subject : "Results of Exam 73",
                        text : 'Please find in attachment the result of your last month exam.',
                        attachments    : [
                            {
                                name: "Exam 73 result",
                                originalCreation: "2021-02-12",
                                mimeType: 'application/pdf',
                                docAsB64,
                            },
                        ]
                    }, ]) {
                        const validationErrors =[];
                        PrivateMessageRecord.Insert({srcOb:privMsgLitOb, validationErrors}
                        ).then(privateMessageRecord => {
                            logger.info(`Inserted privateMessageRecord. : ${privateMessageRecord.toFullOwnJSON()}`);
                        }).catch(e => logger.error(`PrivateMessageRecord.Insert()`, dbMsg(e)));
                    }

                }
            }).catch(e => logger.error(`PatientRecord.GetByPhoneNumber(phoneNumber = '${phoneNumber}')`, e))
        }

    }).catch(e => logger.error(`PractitionerRecord.GetWithCriteria(first_name = '${docFirstName}')`, e));
}
else if ([false, true][ 0 ]) {
}
if ([false, true][ 0 ]) {
}

logger.trace("Initialized ...");
