/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { dateAdd, dbMsg, } = require('../../nodeCore/lib/utils');
const { dbInsert, fetchFromDb } = require('../../nodeCore/lib/dao');
const { FeedRecord, FeedItemRecord } = require('./dao');
const { EIssuerKind } = require('./dao.shared');

const {
    // healthCare      : eIssuerHealthCare,
    // socialSecurity  : eIssuerSocialSecurity,
    // passport        : eIssuerPassport,
    // driverLicense   : eIssuerDriverLicense,
    practiceLicense : eIssuerPracticeLicense,
    // stateID         : eIssuerStateID,
    // other           : eIssuerOther,
} = EIssuerKind;


const self = module.exports;


class PractitionerLegitIdRecord extends FeedRecord {
    #practitioner_id;
    #seq;
    static get TableName() { return 'PractitionerLegitId'; }

    constructor({id, row_version, row_created, row_persisted, practitioner_id, seq, issuer_kind, issuer_alias, number, version, expires_on}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#practitioner_id = practitioner_id;
        this.#seq = seq;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ issuer_kind, issuer_alias, number, version, expires_on });
        // Object.assign(this, { issuer_kind, issuer_alias, number, version, expires_on });
    }

    //region The get/set "interface": {  practitionerId, eIssuerKind, issuer, number, version, expiresOn, ... }

    get practitioner_id() { return this.#practitioner_id; }
    get practitionerId() { return this.#practitioner_id; }

    get seq() { return this.#seq; }


    // noinspection JSUnusedGlobalSymbols
    get eIssuerKind() { throw Error(`${this.Name}.prototype.get eIssuerKind() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set eIssuerKind(value) { throw Error(`${this.Name}.prototype.set eIssuerKind(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get issuerAlias() { throw Error(`${this.Name}.prototype.get issuerAlias() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set issuerAlias(value) { throw Error(`${this.Name}.prototype.set issuerAlias(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get number() { throw Error(`${this.Name}.prototype.get number() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set number(value) { throw Error(`${this.Name}.prototype.set number(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get version() { throw Error(`${this.Name}.prototype.get version() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set version(value) { throw Error(`${this.Name}.prototype.set version(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get expiresOn() { throw Error(`${this.Name}.prototype.get expiresOn() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set expiresOn(value) { throw Error(`${this.Name}.prototype.set expiresOn(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region litOb

    toOwnLitOb() {
        const {  practitionerId, seq, eIssuerKind, issuerAlias, number, version, expiresOn } = this;
        return { practitionerId, seq, eIssuerKind, issuerAlias, number, version, expiresOn };
    }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!

    toApiLitOb() {
        const {  seq, eIssuerKind, issuerAlias, number, version, expiresOn } = this;
        return { seq, eIssuerKind, issuerAlias, number, version, expiresOn };
    }

    //  Being MultiOwned by PractitionerRecord, PractitionerLegitIdRecord must implement MultiOwned "interface" :
    //
    //      toOwnerApiLitOb() {}
    //      static FromOwnedApiLitOb(litOb) {}

    //  How the FeedRecord is LitOb-ed when embedded in its owner.
    toOwnerApiLitOb(apiLitOb={}) {
        const { seq, issuerAlias:issuer, number, version, expiresOn } = this;
        return {           //  todo change this Backend format ? to match patient's and at least to carry expiresOn
            seq,
            issuer,
            number,
            version,
            isActive: ! expiresOn  ||  new Date() < expiresOn,
            ...apiLitOb,
        }
    }

    static FromOwnedApiLitOb(ownedApiLitOb, nativeLitOb) {
        const {  seq, issuer:issuerAlias, number, version, isActive } = ownedApiLitOb;
        return {           //  todo change this Backend format ? to match patient's and at least to carry expiresOn
            seq,
            issuerAlias,
            number,
            version,
            expiresOn : isActive ? null : dateAdd.day(-1),       //  Arbitrarily set to yesterday. :-/
            ...nativeLitOb
        };
    }

    //endregion

    static get _FieldsToOnlyInsert() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'practitioner_id',    recName:'practitionerId',                       },
            { colName:'seq',                                                                },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'issuer_kind',     recName:'eIssuerKind',         recEnum:EIssuerKind,},
            { colName:'issuer_alias',    recName:'issuerAlias',                             },
            { colName:'number',                                                             },
            { colName:'version',                                                            },
            { colName:'expires_on',      recName:'expiresOn',                               },
        ];
    }

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{eIssuerKind: string|EIssuerKind|null|undefined, issuerAlias: string, number: string,
     *          version: string|null|undefined, expiresOn: Date|null|undefined, }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<PractitionerLegitIdRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {
        const { eIssuerKind=null } = srcOb;
        Object.assign(srcOb, {
            eIssuerKind: null===eIssuerKind  ?  eIssuerPracticeLicense : eIssuerKind        //  if was undefined or null
        });
        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }   //  NOTE:   seq value is handled right by DB ON INSERT trigger.
}
(self.PractitionerLegitIdRecord = PractitionerLegitIdRecord).Setup();


class PractitionerRecord extends FeedItemRecord {
    #legitIds = [];
    static get TableName() { return 'Practitioner'; }

    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                                                family_name, first_name, middle_name}) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});

        this._setMostRecentKnownPersistedRowOwnUpdatableValues({family_name, first_name, middle_name});
        // Object.assign(this, {family_name, first_name, middle_name});
    }

    //region The get/set "interface": {  family_name, first_name, middleName ... }

    get familyName() { throw Error(`${this.Name}.prototype.get familyName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set familyName(value) { throw Error(`${this.Name}.prototype.set familyName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get firstName() { throw Error(`${this.Name}.prototype.get firstName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set firstName(value) { throw Error(`${this.Name}.prototype.set firstName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get middleName() { throw Error(`${this.Name}.prototype.get middleName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set middleName(value) { throw Error(`${this.Name}.prototype.set middleName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // ===================================================

    get legitIds() { return this.#legitIds; }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  familyName, firstName, middleName } = this;
        return { familyName, firstName, middleName };
    }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!

    toNonRetiredApiLitOb(apiLitOb={}) {
        const { familyName, firstName, middleName,  } = this;

        return super.toNonRetiredApiLitOb({
            firstName,
            lastName:familyName,
            middleName,
            ...apiLitOb
        });
    }

    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const { firstName, lastName, middleName, } = apiLitOb;

        return super.FromNonRetiredApiLitOb(apiLitOb, {
            familyName:lastName,
            firstName,
            middleName,
            ...nativeLitOb,
        });
    }

    //endregion

    static get _FieldsToOnlyInsert() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
        //  {       ,                                      ,                                },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'family_name',        recName:'familyName',                           },
            { colName:'first_name',         recName:'firstName',                            },
            { colName:'middle_name',        recName:'middleName',                           },
        ];
    }

    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:PractitionerLegitIdRecord, ownerArrayPropertyName:'legitIds', ownerLitObArrayName:'practices' },
        ]
    }

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{feedAlias: string, feedItemId: string|null|undefined, backendItemId: string|null|undefined,
     *          familyName: string, firstName: string, middleName: string|null|undefined,
     *          legitIds:{eIssuerKind: EIssuerKind|null|undefined, issuerAlias: string, number: string,
     *                    version: string|null|undefined, expiresOn: string|Date|null|undefined,}[],
     *          }} srcOb
     * @param {string[]} validationErrors
     * @returns {Promise<PractitionerRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[]}) {

        return await super.Insert({srcOb, validationErrors});
    }

    async update() {
        //  The practitionerLegitIds are really a part of the practitioner. Update them first.

        return await super.update();    //  finish with that so .rowPersisted is the most recent and covers all.
    }   //  todo: Add update of the legitIds. Or find an update strategy

    // async addLegitId({eIssuerKind, issuerAlias, number, version, expiresOn}) {
    //     const { id } = this;
    //     return await PractitionerLegitIdRecord.Insert({id, srcOb:{ eIssuerKind, issuerAlias, number, version, expiresOn }});
    // }

}
(self.PractitionerRecord = PractitionerRecord).Setup();

if ([false, true][ 0 ]) {
    for (let practLitOb of [{
        feedAlias   : 'creamedDP',
        familyName  : 'Bessette',
        firstName   : 'Luc',
        legitIds    : [
            {
                issuerAlias: "CA_QC_CMQ",
                number: "181438",
            }
        ]
    }, {
        feedAlias   : 'creamedDP',
        familyName  : 'Robin',
        firstName   : 'Marc',
        backendItemId: require('uuid').v1(),
        legitIds    : [
            {
                issuerAlias: "CA_QC_CMQ",
                number: "199347",
            }
        ]
    }]) {
        const validationErrors =[];
        PractitionerRecord.Insert({srcOb:practLitOb, validationErrors}
        ).then(practitionerRecord => {
            logger.info(`Inserted practitionerRecord : ${practitionerRecord.toFullOwnJSON()}`);
            // practitionerRecord.retire().then(updatedCnt => {
            //     logger.info(`practitionerRecord : ${practitionerRecord.toNiceJSON()}`);
            // });
        }).catch(e => logger.error(`PractionerRecord.Insert()`, dbMsg(e)));
    }
}
else if ([false, true][ 0 ]) {
    const firstName = ['Luc', 'Marc'][ 1 ];
    PractitionerRecord.GetWithCriteria('WHERE first_name = ?', [firstName]
    ).then(records => {
        for (let record of records) {
            logger.info(`Fetched practitionerRecord : ${record.toNiceJSON()}`);
            logger.info(`Fetched practitionerRecord row : ${record.toRowJSON()}`);
            logger.info(`Fetched practitionerRecord own : ${record.toOwnJSON()}`);
            logger.info(`Fetched practitionerLegitIdRecord : ${record.legitIds[0].toRowJSON()}`);

            if (record.legitIds[0].HasRowRetiredField) {
                record.legitIds[0].retire().catch(e => logger.error(e.message));
            }
        }
        if (records.length) {
            if ([false, true][ 0 ]) {                                           //  WARNING  :  DELETE ! ! !
                const rec =  records[records.length-1];
                rec.delete().then(() =>{
                        logger.info(`Deleted practitionerRecord : ${rec.toFullOwnJSON()}`);

                    }).catch(e =>
                        logger.error(`PractitionerRecord.delete(id=${rec.id}')`, e));
            }
            else {
                if ([false, true][ 0 ]) {
                    const rec =  records[0], newName = ['Bessette', 'Bingo'][ 0 ];
                    rec.lastName = newName;
                    logger.info(`Changed practitionerRecord row : ${rec.toRowJSON()}`);

                    rec.update().then(({row_persisted, row_version}) => {
                        logger.info(`Updated practitionerRecord (v.${row_version}, ${row_persisted}) : ${rec.toNiceJSON()}`);
                    }).catch(e => logger.error(`PractitionerRecord.update(lastName = '${newName}')`, e));
                }
            }
        }
    }).catch(e => logger.error(`PractitionerRecord.GetWithCriteria(first_name = '${firstName}')`, e));
}
if ([false, true][ 0 ]) {
    const s0 = {sql:`SELECT birthPlace.*, motherBirthPlace.*, selfContact.*, selfContact_address.*, emergencyContact.*, BIN_TO_UUID(\`Patient\`.\`feed_item_id\`,1) AS \`Patient__feed_item_id_hex\`, BIN_TO_UUID(\`selfContact\`.\`feed_item_id\`,1) AS \`selfContact__feed_item_id_hex\`, BIN_TO_UUID(\`primaryPractitioner\`.\`feed_item_id\`,1) AS \`primaryPractitioner__feed_item_id_hex\` FROM Patient
        LEFT JOIN BirthPlace AS birthPlace ON Patient.birth_place_id = birthPlace.id
        LEFT JOIN BirthPlace AS motherBirthPlace ON Patient.mother_birth_place_id = motherBirthPlace.id 
        LEFT JOIN Contact AS selfContact ON Patient.self_contact_id = selfContact.id 
        LEFT JOIN CivicAddress AS selfContact_address ON selfContact.address_id = selfContact_address.id
        LEFT JOIN Contact AS emergencyContact ON Patient.emergency_contact_id = emergencyContact.id
        LEFT JOIN Practitioner AS primaryPractitioner ON Patient.primary_practitioner_id = primaryPractitioner.id
        WHERE Patient.id=?`,  nestTables: true};

    const s = [s0,],
                   i=0;
    fetchFromDb(s[ i ], [[ 2 ],]
                 [ i ])
        .then(rows => {
            for (let row of rows) {
                logger.debug(row, 'plusss', row[''] );
            }
        }).catch( e =>
        logger.error(`Fetching full Patient : `, dbMsg(e)));
}

logger.trace("Initialized ...");
