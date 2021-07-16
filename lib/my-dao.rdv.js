/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { dbMsg, Enum, EItem } = require('../../nodecore/lib/utils');
const { dbInsert, dbUpdate, dbDelete, fetchFromDb } = require('../../nodecore/lib/my-dao');
const { FeedRecord, FeedItemRecord, RecordJoined, Referenced, UniOwned, OnlyInserted, InsertAndUpdated,
        Validation, } = require('./my-dao');

const { PractitionerRecord } = require('./my-dao.practitioner');
const { PatientRecord } = require('./my-dao.patient');


const self = module.exports;

//region Appointment Enums

const ERdvLocation = (f=>{f.prototype=new Enum(f); return new f({});})(function ERdvLocation({
    clinic   =(f=>f(f))(function clinic(f)    { return EItem(ERdvLocation, f); }),
    home     =(f=>f(f))(function home(f)      { return EItem(ERdvLocation, f); }),
    video    =(f=>f(f))(function video(f)     { return EItem(ERdvLocation, f); }),
    telephone=(f=>f(f))(function telephone(f) { return EItem(ERdvLocation, f); }),
}) {  Enum.call(Object.assign(this, { clinic, home, video, telephone })); });
self.ERdvLocation= ERdvLocation;
const {
    clinic:     eRdvLocationClinic,
    //  home:       eRdvLocationHome,
    video:      eRdvLocationVideo,
    telephone:  eRdvLocationTelephone,
} = ERdvLocation;
[eRdvLocationClinic, eRdvLocationVideo, eRdvLocationTelephone,].join();   //  Kludge to prevent stupid 'unused' warnings.

const ERdvConfirmationStatus = (f=>{f.prototype=new Enum(f); return new f({});})(function ERdvConfirmationStatus({
    pending  =(f=>f(f))(function pending(f)   { return EItem(ERdvConfirmationStatus, f); }),
    confirmed=(f=>f(f))(function confirmed(f) { return EItem(ERdvConfirmationStatus, f); }),
    cancelled=(f=>f(f))(function cancelled(f) { return EItem(ERdvConfirmationStatus, f); }),
}) { Enum.call(Object.assign(this, { pending, confirmed, cancelled })); });
self.ERdvConfirmationStatus= ERdvConfirmationStatus;
const {
    pending:    eRdvConfirmationPending,
    confirmed:  eRdvConfirmationConfirmed,
    cancelled:  eRdvConfirmationCancelled,
} = ERdvConfirmationStatus;
[eRdvConfirmationPending, eRdvConfirmationConfirmed, eRdvConfirmationCancelled,].join();   //  Kludge to prevent stupid 'unused' warnings.


//endregion


class RdvJoined extends RecordJoined {
    // noinspection JSUnusedGlobalSymbols
    feedPractitionerId(joinName) { return Referenced({joinName, FeedRecord:PractitionerRecord, referencePropertyName:'practitioner', referenceIdLitObName:'practitionerId' }); }
    // noinspection JSUnusedGlobalSymbols
    feedPatientId(     joinName) { return Referenced({joinName, FeedRecord:PatientRecord, referencePropertyName:'patient', referenceIdLitObName:'patientId', }); }

}
class RdvRecord extends FeedItemRecord {
    #practitioner_id;
    #patient_id;
    #location;
    #description;
    #start_time;
    #end_time;
    #patient_must_confirm;
    #patient_confirmed;
    #patient_unconfirmed;
    #patient_cancelled;

    static get TableName() { return 'Rdv'; }
    static get Joined() { return new RdvJoined(this); }

    // noinspection DuplicatedCode
    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                    practitioner_id, patient_id, location, description, start_time, end_time, notes,
                    patient_must_confirm, confirmation_status, patient_confirmed, patient_unconfirmed, patient_cancelled }) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});

        this.#practitioner_id = practitioner_id;
        this.#patient_id = patient_id;
        this.#location = location;
        this.#description = description;
        this.#start_time = start_time;
        this.#end_time = end_time;
        this.#patient_confirmed = patient_confirmed;
        this.#patient_unconfirmed = patient_unconfirmed;
        this.#patient_cancelled = patient_cancelled;
        this.#patient_must_confirm = patient_must_confirm;

        this._setMostRecentKnownPersistedRowOwnUpdatableValues(({notes, confirmation_status }));
        // Object.assign(this, { notes, confirmation_status });
    }

    //region The get/set "interface": { practitionerId, patientId, eLocation, description, startTime, endTime, patientConfirmed, patientUnconfirmed, patientCancelled, patientMustConfirm, notes }

    // noinspection JSUnusedGlobalSymbols
    get practitioner_id() { return this.#practitioner_id; }
    get practitionerId()  { return this.#practitioner_id; }

    // noinspection JSUnusedGlobalSymbols
    get patient_id() { return this.#patient_id; }
    get patientId()  { return this.#patient_id; }


    get location() { return this.#location; }
    get eLocation() { return ERdvLocation[this.#location]; }

    get description() { return this.#description; }

    // noinspection JSUnusedGlobalSymbols
    get start_time() { return this.#start_time; }
    get startTime()  { return this.#start_time; }

    // noinspection JSUnusedGlobalSymbols
    get end_time() { return this.#end_time; }
    get endTime()  { return this.#end_time; }

    // noinspection JSUnusedGlobalSymbols
    get patient_confirmed() { return this.#patient_confirmed; }
    get patientConfirmed() { return this.#patient_confirmed; }

    // noinspection JSUnusedGlobalSymbols
    get patient_unconfirmed() { return this.#patient_unconfirmed; }
    get patientUnconfirmed() { return this.#patient_unconfirmed; }

    // noinspection JSUnusedGlobalSymbols
    get patient_cancelled() { return this.#patient_cancelled; }
    get patientCancelled() { return this.#patient_cancelled; }

    // noinspection JSUnusedGlobalSymbols
    get patient_must_confirm() { return this.#patient_must_confirm; }
    get patientMustConfirm() { return this.#patient_must_confirm; }

    // noinspection JSUnusedGlobalSymbols
    get notes() { throw Error(`${this.Name}.prototype.get notes() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set notes(value) { throw Error(`${this.Name}.prototype.set notes(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }


    // noinspection JSUnusedGlobalSymbols
    get eConfirmationStatus() { throw Error(`${this.Name}.prototype.get eConfirmationStatus() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set eConfirmationStatus(value) { throw Error(`${this.Name}.prototype.set eConfirmationStatus(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // ===================================================

    //  Referenced

    // noinspection JSUnusedGlobalSymbols
    get feedPractitionerId() { throw Error(`${this.Name}.prototype.get feedPractitionerId() : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get feedPatientId() { throw Error(`${this.Name}.prototype.get feedPatientId() : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const { eLocation, description, startTime, endTime, notes,
                patientMustConfirm, eConfirmationStatus, patientConfirmed, patientUnconfirmed, patientCancelled} = this;

        return {eLocation, description, startTime, endTime, notes,
                patientMustConfirm, eConfirmationStatus, patientConfirmed, patientUnconfirmed, patientCancelled };
    }

    toNonRetiredApiLitOb(apiLitOb={}) {
        const { feedItemId, location, description, startTime, endTime, notes, confirmationStatus, patientMustConfirm, } = this;

        return super.toNonRetiredApiLitOb({
            id: feedItemId,
            location,
            description,
            startTime,
            endTime,
            notes:  notes ? notes : null,
            patientMustConfirm,
            confirmationStatus,

            // patientId,
            // practitionerId,

            ...apiLitOb
        });
    }

    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const { feedItemId, id=feedItemId, location, description, startTime, endTime, notes,
                                                     confirmationStatus, patientMustConfirm } = apiLitOb;

        return super.FromNonRetiredApiLitOb(apiLitOb, {
            feedItemId: id,
            eLocation: location,
            description,
            startTime,
            endTime,
            notes,
            patientMustConfirm,
            eConfirmationStatus: confirmationStatus,

            ...nativeLitOb,
        });
    }

    //endregion

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        location(   colName) {  return OnlyInserted({colName, recName:'eLocation', recEnum:ERdvLocation }); },
        description(colName) {  return OnlyInserted({colName,                                           }); },
        start_time( colName) {  return OnlyInserted({colName, recName:'startTime'                       }); },
        end_time(   colName) {  return OnlyInserted({colName, recName:'endTime'                         }); },
        patient_must_confirm(colName) {  return OnlyInserted({colName, recName:'patientMustConfirm'     }); },
        patient_confirmed(   colName) {  return OnlyInserted({colName, recName:'patientConfirmed'       }); },
        patient_unconfirmed( colName) {  return OnlyInserted({colName, recName:'patientUnconfirmed'     }); },
        patient_cancelled(   colName) {  return OnlyInserted({colName, recName:'patientCancelled'       }); },

        notes(              colName) {  return InsertAndUpdated({colName,                                        }); },
        confirmation_status(colName) {  return InsertAndUpdated({colName, recName:'eConfirmationStatus', recEnum:ERdvConfirmationStatus }); },

        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwned|
        //  Owner of a .Joined UniOwned() entry, or as .colNameJoiningToReferenced of a
        //  .Joined Referenced() entry.  Editing is rather done via .whatever object.
        practitioner_id(colName) {  return OnlyInserted({colName,   }); },
        patient_id(     colName) {  return OnlyInserted({colName,   }); },
    };

    static get DbManagedColumnNames() {
        return super.DbManagedColumnNames.concat([ this._OwnFields.confirmation_status.name, ]);
    }

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{feedAlias: string, feedItemId: string|null|undefined, backendItemId: string|null|undefined,
     *          feedPractitionerId: string, feedPatientId: string, startTime: string, endTime: string,
     *          eLocation: ERdvLocation|string, description: string, notes: string|null|undefined,
     *          }} srcOb
     * @param {Error[]} validationErrors
     * @returns {Promise<PractitionerRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[]}) {
        return await super.Insert({srcOb, validationErrors});
    }


}
(self.RdvRecord = RdvRecord).Setup();


class RdvPractitionerJoined extends RecordJoined {}
class RdvPractitionerRecord extends FeedItemRecord {
    #family_name;
    #first_name;
    #middle_name;

    static get TableName() { return 'Practitioner'; }
    static get Joined() { return new RdvPractitionerJoined(this); }

    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                                                                            family_name, first_name, middle_name, }) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});

        this.#family_name = family_name;
        this.#first_name = first_name;
        this.#middle_name = middle_name;

        // this._setMostRecentKnownPersistedRowOwnUpdatableValues(({ family_name, first_name, middle_name, }));
        // Object.assign(this, {family_name, first_name, middle_name, });
    }

    //region The get/set "interface": {  family_name, first_name, middleName ... }


    // noinspection JSUnusedGlobalSymbols
    get family_name() { return this.#family_name; }
    get familyName() {  return this.#family_name; }

    get first_name() { return this.#first_name; }
    get firstName() {  return this.#first_name; }

    // noinspection JSUnusedGlobalSymbols
    get middle_name() { return this.#middle_name; }
    get middleName() {  return this.#middle_name; }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  familyName, firstName, middleName } = this;
        return { familyName, firstName, middleName };
    }

    toNonRetiredApiLitOb(apiLitOb={}) {
        const { feedItemId, familyName, firstName, middleName,  } = this;
        return { feedItemId, familyName, firstName, middleName, ...apiLitOb };
    }     //  Dont' do the whole run down FeedItemRecord and FeedRecord

    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const {  feedItemId, familyName, firstName, middleName, } = apiLitOb;

        return {
            feedItemId,
            familyName,
            firstName,
            middleName,
            ...nativeLitOb,
        };
    }     //  Dont' do the whole run down FeedItemRecord and FeedRecord

    //endregion

    static _OwnFields = {
        family_name(colName) {  return OnlyInserted({colName, recName:'familyName', }); },
        first_name( colName) {  return OnlyInserted({colName, recName:'firstName',  }); },
        middle_name(colName) {  return OnlyInserted({colName, recName:'middleName', }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{feedAlias: string, feedItemId: string|null|undefined, backendItemId: string|null|undefined,
     *          familyName: string, firstName: string, middleName: string|null|undefined, }} srcOb
     * @param {Error[]} validationErrors
     * @returns {Promise<RdvPractitionerRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[]}) {
        validationErrors.push(Error(`Insert of ${this.FeedItemName} is not supported.`));
        throw Validation(`Inserting ${this.FeedItemName} :\n${validationErrors.join('\n')}`, validationErrors);
    }
}
(self.RdvPractitionerRecord = RdvPractitionerRecord).Setup();

// NOTE :
//          An AppointmentRecord, different of a RdvRecord, is needed only because of the ApiLitOb "with" property,
//          which is made from a composition of the linked Practitioner names property, on top of its feedItemId to
//          be used as its practitionerId property.
class AppointmentJoined extends RecordJoined {
    // noinspection JSUnusedGlobalSymbols
    rdvPractitioner(joinName) { return UniOwned({joinName, FeedRecord:RdvPractitionerRecord  }); }
    // noinspection JSUnusedGlobalSymbols
    feedPatientId(     joinName) { return Referenced({joinName, FeedRecord:PatientRecord, referencePropertyName:'patient', referenceIdLitObName:'patientId', }); }

}
class AppointmentRecord extends RdvRecord {

    static get TableName() { return 'Rdv'; }
    static get Joined() { return new AppointmentJoined(this); }

    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                    practitioner_id, patient_id, location, description, start_time, end_time, notes,
                    patient_must_confirm, confirmation_status, patient_confirmed, patient_unconfirmed, patient_cancelled }) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id,
                practitioner_id, patient_id, location, description, start_time, end_time, notes,
                patient_must_confirm, confirmation_status, patient_confirmed, patient_unconfirmed, patient_cancelled });
    }

    //region The get/set "interface": { rdvPractitioner, feedPatientId }

    //  UniOwned

    get rdvPractitioner() { throw Error(`${this.Name}.prototype.get rdvPractitioner() : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get feedPatientId() { throw Error(`${this.Name}.prototype.get feedPatientId() : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const { eLocation, description, startTime, endTime, notes,
            patientMustConfirm, eConfirmationStatus, patientConfirmed, patientUnconfirmed, patientCancelled} = this;

        return {eLocation, description, startTime, endTime, notes,
            patientMustConfirm, eConfirmationStatus, patientConfirmed, patientUnconfirmed, patientCancelled };
    }

    toNonRetiredApiLitOb(apiLitOb={}) {
        const appointment =  super.toNonRetiredApiLitOb({

            // patientId,
            // rdvPractitioner,

            ...apiLitOb
        });
        const rdvPract = appointment.rdvPractitioner;
        if (rdvPract) {
            delete appointment.rdvPractitioner;

            const { feedItemId:practitionerId, familyName, firstName, middleName, } = rdvPract;
            Object.assign(appointment, {
                practitionerId,
                ["with"] : `${familyName}, ${firstName}`+ (middleName ? ', ' + middleName  : ''),
            })
        }
        return appointment;
    }

    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const { practitionerId } = apiLitOb;
        const withProperty = apiLitOb["with"];
        const [ , familyName, ,name1 ,name2] =  withProperty  ?  (
            withProperty.match(/([^,]+),\s+(([^,]+),\s+)?(.+)$/) || [undefined,undefined,undefined,undefined,undefined]
            )                                                 :     [undefined,undefined,undefined,undefined,undefined];

        return super.FromNonRetiredApiLitOb(apiLitOb, {
            practitionerId,
            rdvPractitioner: ! familyName  ? undefined  :
                name1   ?   {
                    familyName,
                    firstName: name1,
                    middleName: name2
                }       :   {
                    familyName,
                    firstName: name2,
                },

            ...nativeLitOb,
        });
    }

    //endregion

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwned|
        //  Owner of a .Joined UniOwned() entry, or as .colNameJoiningToReferenced of a
        //  .Joined Referenced() entry.  Editing is rather done via .whatever object.
        practitioner_id(colName) {  return OnlyInserted({colName,   }); },
        patient_id(     colName) {  return OnlyInserted({colName,   }); },
    };

    static async Insert({srcOb, validationErrors=[]}) {
        validationErrors.push(Error(`Insert of ${this.FeedItemName} is not supported.`));
        throw Validation(`Inserting ${this.FeedItemName} :\n${validationErrors.join('\n')}`, validationErrors);
    }
}
(self.AppointmentRecord = AppointmentRecord).Setup();



const ERdvDisposition = (f=>{f.prototype=new Enum(f); return new f({});})(function ERdvDisposition({
    patientConfirmed  =(f=>f(f))(function patientConfirmed(f)   { return EItem(ERdvDisposition, f); }),
    patientCancelled  =(f=>f(f))(function patientCancelled(f)   { return EItem(ERdvDisposition, f); }),
    patientUnconfirmed=(f=>f(f))(function patientUnconfirmed(f) { return EItem(ERdvDisposition, f); }),
}) { Enum.call(Object.assign(this, {patientConfirmed, patientCancelled, patientUnconfirmed})); });
self.ERdvDisposition = ERdvDisposition;
const {
    patientConfirmed:   eRdvDispositionPatientConfirmed,
    patientCancelled:   eRdvDispositionPatientCancelled,
    patientUnconfirmed: eRdvDispositionPatientUnconfirmed,
} = ERdvDisposition;
[eRdvDispositionPatientConfirmed, eRdvDispositionPatientCancelled,eRdvDispositionPatientUnconfirmed,].join();   //  Kludge to prevent stupid 'unused' warnings.


class RdvDispositionJoined extends RecordJoined {}
class RdvDispositionRecord extends FeedRecord {
    #feed_item_id;
    #confirmation_status;
    static get TableName() { return 'Rdv'; }
    static get uuidDbName() { return 'feed_item_id'; }
    static get Joined() { return new RdvDispositionJoined(this); }

    constructor({feed_item_id, confirmation_status, patient_confirmed, patient_unconfirmed, patient_cancelled,
                                                ...id__row_version__row_created__row_persisted__row_retired}) {

        super(id__row_version__row_created__row_persisted__row_retired);
        this.#feed_item_id = feed_item_id;
        this.#confirmation_status = confirmation_status;

        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ patient_confirmed, patient_unconfirmed, patient_cancelled });
        // Object.assign(this, { patient_confirmed, patient_unconfirmed, patient_cancelled, });
    }

    //region The get/set "interface": {  feedItemId, eConfirmationStatus, patientConfirmed, patientUnconfirmed, patientCancelled }

    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }

    // noinspection JSUnusedGlobalSymbols
    get confirmationStatus() { return this.#confirmation_status; }
    get eConfirmationStatus() { throw ERdvConfirmationStatus[this.#confirmation_status]; }

    // noinspection JSUnusedGlobalSymbols
    get patientConfirmed() { throw Error(`${this.Name}.prototype.get patientConfirmed() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set patientConfirmed(value) { throw Error(`${this.Name}.prototype.set patientConfirmed(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get patientUnconfirmed() { throw Error(`${this.Name}.prototype.get patientUnconfirmed() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set patientUnconfirmed(value) { throw Error(`${this.Name}.prototype.set patientUnconfirmed(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get patientCancelled() { throw Error(`${this.Name}.prototype.get patientCancelled() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set patientCancelled(value) { throw Error(`${this.Name}.prototype.set patientCancelled(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }


    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  feedItemId, eConfirmationStatus, patientCancelled, patientConfirmed, patientUnconfirmed } = this;

        return { feedItemId, eConfirmationStatus, patientCancelled, patientConfirmed, patientUnconfirmed, };
    }

    toApiLitOb(apiLitOb={}) {   //  even the retired Rdv have their RdvDisposition still visible.
        return this.toNonRetiredApiLitOb(apiLitOb);
    }

    toNonRetiredApiLitOb(apiLitOb={}) {
        const {  feedAlias, feedItemId, patientCancelled, patientConfirmed, patientUnconfirmed } = this;

        const   [status , lastUpdated] =
                    patientCancelled ?
            [eRdvDispositionPatientCancelled,   patientCancelled  ] :
                    patientConfirmed && ( ! patientUnconfirmed || patientConfirmed > patientUnconfirmed ) ?
            [eRdvDispositionPatientConfirmed,   patientConfirmed  ] :
                    patientUnconfirmed ?
            [eRdvDispositionPatientUnconfirmed, patientUnconfirmed] :
                [undefined, undefined];     //  Yeah, weird: if no rdvDisposition was received: no [status, lastUpdated]
        return {
            feedAlias,
            id: feedItemId,
            status,
            lastUpdated,

            ...apiLitOb
        };
    }

    static FromNonRetiredApiLitOb(apiLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()

        const { id: feedItemId, status, lastUpdated, } = apiLitOb;

        const eRdvDisposition = ERdvDisposition[status];

        return eRdvDisposition  ?  {
            feedItemId,
            [eRdvDisposition]: lastUpdated
        }                       :  {
            feedItemId
        };
    }   //  apiLitOb is not cleaned up afterward.

    //endregion

    static _OwnFields = {
        feed_item_id(       colName) {  return OnlyInserted({colName, recName:'feedItemId',             }); },
        confirmation_status(colName) {  return OnlyInserted({colName, recName:'eConfirmationStatus',    recEnum:ERdvConfirmationStatus, }); },

        patient_confirmed(  colName) {  return InsertAndUpdated({colName, recName:'patientConfirmed',   }); },
        patient_unconfirmed(colName) {  return InsertAndUpdated({colName, recName:'patientUnconfirmed', }); },
        patient_cancelled(  colName) {  return InsertAndUpdated({colName, recName:'patientCancelled',   }); },
    };

    static get DbManagedColumnNames() {
        return super.DbManagedColumnNames.concat([ this._OwnFields.confirmation_status.name, ]);
    }

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{}} srcOb
     * @param {Error[]} validationErrors
     * @returns {Promise<RdvDispositionRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[]}) {
        validationErrors.push(Error(`Insert of ${this.FeedItemName} is not supported.`));
        throw Validation(`Inserting ${this.FeedItemName} :\n${validationErrors.join('\n')}`, validationErrors);
    }

    /**
     *
     * @param {{feedItemId: string, patientConfirmed: string|undefined,
     *          patientUnconfirmed: string|undefined, patientCancelled: string|undefined}} nativeSrcOb
     * @param {Error[]} validationErrors
     * @param {string[]} conflicts
     * @param {function} _dbInsert
     * @param {function} _dbUpdate
     * @param {function} _dbDelete
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @return {Promise<RdvDispositionRecord>}
     */
    async updateWithCandidate(nativeSrcOb, {validationErrors=[], conflicts=[], _dbInsert=dbInsert, _dbUpdate=dbUpdate,
        _dbDelete=dbDelete, _fetchFromDb=fetchFromDb, trans=null}={}) {
        return await super.updateWithCandidate(nativeSrcOb, { validationErrors, conflicts, _dbInsert, _dbUpdate,
            _dbDelete, _fetchFromDb, trans});
    }

}
const { DaoPushSingle, GetByUuid, } = FeedItemRecord;
Object.assign(RdvDispositionRecord, { DaoPushSingle, GetByUuid, }) ;
(self.RdvDispositionRecord = RdvDispositionRecord).Setup({isOnlyUpdatingAvailableValues:true});


if ([false, true][ 0 ]) {
    let feedPractitionerId, feedPatientId;
    const docFirstName = ['Luc', 'Marc'][ 0 ];
    const phoneNumber = ['(327) 384-1906','1-555-222-3333'][ 1 ];

    PractitionerRecord.GetWithCriteria('WHERE first_name = ?', [docFirstName]
    ).then(records => {
        if (records.length) {
            feedPractitionerId = records[2].feedItemId;

            PatientRecord.GetByPhoneNumber(phoneNumber
            ).then(records => {
                if (records.length) {
                    feedPatientId = records[1].feedItemId;

                    for (let rdvLitOb of [{
                        feedAlias: 'fiktivDP',
                        feedPractitionerId,
                        feedPatientId,
                        eLocation : 'clinic',
                        description : "Covid-19 vaccine appointment",
                        notes : 'Must be alive. #app',
                        startTime : '2021-05-15T15:15:00',
                        endTime : '2021-05-15T15:25:00',
                    }, ]) {
                        const validationErrors =[];
                        RdvRecord.Insert({srcOb:rdvLitOb, validationErrors}
                        ).then(rdvRecord => {
                            logger.info(`Inserted rdvRecord. : ${rdvRecord.toFullOwnJSON()}`);
                        }).catch(e => logger.error(`RdvRecord.Insert()`, dbMsg(e)));
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
