/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);
const {randomArray} = require('secure-random');

const { Enum, EItem, normalizeName, normalizePhoneNumber, dbMsg, } = require('../../nodeCore/lib/utils');
const { dbInsert, fetchFromDb } = require('../../nodeCore/lib/dao');
const { FeedRecord, FeedItemRecord, ReferencedFeedRecordSetup, WrongType, OnlyInserted, InsertAndUpdated,
        RecordJoined, Referenced, UniOwned, MultiOwned } = require('./dao');
const { PractitionerRecord } = require('./dao.practitioner');

const { EIssuerKind } = require('./dao.shared');
const {
    healthCare      : eIssuerHealthCare,
    // socialSecurity  : eIssuerSocialSecurity,
    // passport        : eIssuerPassport,
    // driverLicense   : eIssuerDriverLicense,
    // practiceLicense : eIssuerPracticeLicense,
    // stateID         : eIssuerStateID,
    // other           : eIssuerOther,
} = EIssuerKind;


const self = module.exports;

Object.assign(self, {EIssuerKind});

const EGender = (f=>{f.prototype=new Enum(f); return new f({});})(function EGender({
    F =(f=>f(f))(function F(f) { return EItem(EGender, f); }),
    M =(f=>f(f))(function M(f) { return EItem(EGender, f); }),
    N =(f=>f(f))(function N(f) { return EItem(EGender, f); }),
}) {  Enum.call(Object.assign(this, {F, M, N})); });
self.EGender=EGender;
const {
    F   : eGenderF,
    M   : eGenderM,
    N   : eGenderN,
} = EGender;

[ eGenderF, eGenderM, eGenderN, ].join();    //  Kludge to prevent stupid 'unused' warnings.


//region chart number

const generateA = (incrementing4b, random1b) =>                                         //  address is encoded
                [   //  0           1           3           2           6           7           5           4
                    ['A','A'],  ['B','C'],  ['F','F'],  ['D','E'],  ['K','K'],  ['L','M'],  ['I','J'],  ['G','H'],
                    //  C           E           F           D           9           B           A           8
                    ['U','V'],  ['X','Y'],  ['Z','Z'],  ['W','W'],  ['P','P'],  ['S','T'],  ['Q','R'],  ['N','O'],
                ][incrementing4b][random1b];    //  already a string

const generate000 = (incrementingLo3b, incrementingHi5b, random2b) => {     //  spread 256 int into ['000', ...'999']
    const incrementing8b  = (incrementingHi5b << 3) | [0, 2, 3, 1, 5, 7, 6, 4][incrementingLo3b],     // encode lo3b
          hi3b            =  incrementingHi5b >> 2,
          mid2b           =  incrementingHi5b       & 0x3;

                //  every 32 of incrementing, do a random(3 of 4) rather than random(4): if random2b is 2 or 3, return 2
    return    `${(  (mid2b !== 0x3  &&  (random2b & 0x2))  ?  0x2  :  random2b)     +
                                        (incrementing8b << 2)  -  incrementingHi5b  +   hi3b}`.padStart(3,'0');
};                                                  //   * 4

const generateFromLow12b = (incrementing64bBigInt, random16b) => {
    const lo12b = Number(incrementing64bBigInt & 0xfffn) | 0,        //  bigInt -> Number -> int coerced by | 0
        even4ofLo7b = ( ( lo12b       & 0x1) |      //  b0
                        ((lo12b >> 1) & 0x2) |      //  b2
                        ((lo12b >> 2) & 0x4) |      //  b4
                        ((lo12b >> 3) & 0x8)    ),  //  b6

        odd3ofLo7b  = ( ((lo12b >> 1) & 0x1) |      //  b1
                        ((lo12b >> 2) & 0x2) |      //  b3
                        ((lo12b >> 3) & 0x4)    );  //  b5

    return  [   generateA(even4ofLo7b, random16b & 0x1),
                generate000(odd3ofLo7b, lo12b >> 7, (random16b >> 1) & 0x3)   ];
};

const generateFromLow20b = (incrementing64bBigInt, random16b) => {
    const   [a, lo000] = generateFromLow12b(incrementing64bBigInt, random16b),
            mid8bFromb12 = Number(incrementing64bBigInt & 0xf_f000n) >> 12,
            hi000 = generate000(mid8bFromb12 & 0x7, mid8bFromb12 >> 3, (random16b >> 3) & 0x3);

    return a + hi000 + '-' + lo000;
};

const generateChartNumber = (incrementing64bBigInt, random2x8b=randomArray(2)) => {
    const random16b = ((random2x8b[1] & 0xff) << 8) | (random2x8b[0] & 0xff);

    if ( incrementing64bBigInt < 0x1000n) {                                         //  3 nibbles :     12b :   4k
        return generateFromLow12b(incrementing64bBigInt, random16b).join('');       //  4k in, to 26'000 out, in 'N000'.
    }
    else {                          //  256 × 4k = 1M in, to 26'000'000 out, in 'N000-000'.
        let acc = generateFromLow20b(incrementing64bBigInt & 0xf_ffffn, random16b),      //  1M

            nibbleCnt   = 5,
            shift       = BigInt(nibbleCnt << 2),                                           //  × 4 :   20b
            threshold   = 1n << shift;                                              //  0x10_0000 :     20b :   1M

        if (incrementing64bBigInt < threshold) {
            return acc;
        }
        do {
            //  with shift starting at 20, the max unsigned 64b value will be 44b long, below the 53b limit of Number.
            acc = generateA(Number(incrementing64bBigInt >> shift) & 0xf,           //  next nibble
                            (random16b >> nibbleCnt) & 0x1)     +   ((nibbleCnt % 3) ? '' : '-')    +   acc;

            shift += 4n;                                                //  24, 28, 32, 36, 40, 44, 48, 52, 56, 60
            nibbleCnt ++;                       //  [5:16]
            threshold = 1n << shift;                                    //  16M 256M 4G 64G 1T 16T 256T 4P  64P 1E

        } while (incrementing64bBigInt >= threshold  &&  nibbleCnt < 16);
        return acc;
    }
};
[generateChartNumber(0n)].join();
// logger.debug(generateChartNumber(0x0fffn));
// logger.debug(generateChartNumber(0x1000n));
// logger.debug(generateChartNumber(0x0f_f000n));
// logger.debug(generateChartNumber(0x10_f000n));
// logger.debug(generateChartNumber(0x0fff_ffff_ffff_ffffn));
// logger.debug(generateChartNumber(0x1000_0000_0000_0000n));
// logger.debug(generateChartNumber(0xffff_ffff_ffff_fff7n));
// const chartNumberMap = new Map();
// for (let i = 1n; i < 5n * 1n; i++) {
//     const chartNum = generateChartNumber(i);
//     if (chartNumberMap.get(chartNum)) {
//         throw Error(`chartNumber ${chartNum} already exist for ${i}`);
//     }
//     chartNumberMap.set(chartNum, i);
//     logger.debug(chartNum);
// }
// logger.debug(generateChartNumber(0x362e3n));

//endregion

class BirthPlaceJoined extends RecordJoined {}
class BirthPlaceRecord extends FeedRecord {

    static get TableName() { return 'BirthPlace'; }
    static get Joined() { return new BirthPlaceJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       street_1, street_2, city, state, zip, country}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({street_1, street_2, city, state, zip, country});
        // Object.assign(this, { street_1, street_2, city, state, zip, country });
    }

    //region The get/set "interface": {  street1, street2, city, state, zip, country, ... }

    /**
     *
     * @returns {*}
     */
    get street1() { throw Error(`${this.Name}.prototype.get street1() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set street1(value) { throw Error(`${this.Name}.prototype.set street1(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get street2() { throw Error(`${this.Name}.prototype.get street2() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set street2(value) { throw Error(`${this.Name}.prototype.set street2(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get city() { throw Error(`${this.Name}.prototype.get city() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set city(value) { throw Error(`${this.Name}.prototype.set city(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get state() { throw Error(`${this.Name}.prototype.get state() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set state(value) { throw Error(`${this.Name}.prototype.set state(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get zip() { throw Error(`${this.Name}.prototype.get zip() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set zip(value) { throw Error(`${this.Name}.prototype.set zip(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get country() { throw Error(`${this.Name}.prototype.get country() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set country(value) { throw Error(`${this.Name}.prototype.set country(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region litOb

    toOwnLitOb() {
        const {  street1, street2, city, state, zip, country } = this;
        return { street1, street2, city, state, zip, country };
    }

    toApiLitOb() {
        const {  street1, street2, city, state, zip, country } = this;
        return { street1, street2, city, state, zip, country };
    }

//  toOwnerApiLitOb()                   //  defaults to FeedRecord.prototype.toOwnerApiLitOb = thisProto.toApiLitOb
    static FromOwnedApiLitOb(ownedLitOb) {
        const {  street1, street2, city, state, zip, country, } = ownedLitOb;
        return { street1, street2, city, state, zip, country, };
    }

    //endregion

    static _OwnFields = {
        street_1(colName) { return InsertAndUpdated({colName, recName:'street1',    }); },
        street_2(colName) { return InsertAndUpdated({colName, recName:'street2',    }); },
        city(    colName) { return InsertAndUpdated({colName,                       }); },
        state(   colName) { return InsertAndUpdated({colName,                       }); },
        zip(     colName) { return InsertAndUpdated({colName,                       }); },
        country( colName) { return InsertAndUpdated({colName,                       }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{street1: string|null|undefined, street2: string|null|undefined, city: string|null|undefined,
     *          state: string|null|undefined, zip: string|null|undefined, country: string}} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<BirthPlaceRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }

}
(self.BirthPlaceRecord = BirthPlaceRecord).Setup();


class CivicAddressJoined extends RecordJoined {}
class CivicAddressRecord extends FeedRecord {

    static get TableName() { return 'CivicAddress'; }
    static get Joined() { return new CivicAddressJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       street_1, street_2, city, state, zip, country}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({street_1, street_2, city, state, zip, country});
        // Object.assign(this, { street_1, street_2, city, state, zip, country });
    }

    //region The get/set "interface": {  street1, street2, city, state, zip, country, ... }

    // noinspection JSUnusedGlobalSymbols
    get street1() { throw Error(`${this.Name}.prototype.get street1() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set street1(value) { throw Error(`${this.Name}.prototype.set street1(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    // noinspection JSUnusedGlobalSymbols
    get street2() { throw Error(`${this.Name}.prototype.get street2() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set street2(value) { throw Error(`${this.Name}.prototype.set street2(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get city() { throw Error(`${this.Name}.prototype.get city() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set city(value) { throw Error(`${this.Name}.prototype.set city(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get state() { throw Error(`${this.Name}.prototype.get state() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set state(value) { throw Error(`${this.Name}.prototype.set state(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get zip() { throw Error(`${this.Name}.prototype.get zip() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set zip(value) { throw Error(`${this.Name}.prototype.set zip(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get country() { throw Error(`${this.Name}.prototype.get country() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set country(value) { throw Error(`${this.Name}.prototype.set country(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region litOb

    toOwnLitOb() {
        const {  street1, street2, city, state, zip, country } = this;
        return { street1, street2, city, state, zip, country };
    }

    toApiLitOb() {
        const {  street1, street2, city, state, zip, country } = this;
        return { street1, street2, city, state, zip, country };
    }

//  toOwnerApiLitOb()                   //  defaults to FeedRecord.prototype.toOwnerApiLitOb = thisProto.toApiLitOb
    static FromOwnedApiLitOb(ownedLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()
        const { street1, street2, city, state, zip, country, } = ownedLitOb;
        return {street1, street2, city, state, zip, country, };
    }

    //endregion

    static _OwnFields = {
        street_1(colName) { return InsertAndUpdated({colName, recName:'street1',    }); },
        street_2(colName) { return InsertAndUpdated({colName, recName:'street2',    }); },
        city(    colName) { return InsertAndUpdated({colName,                       }); },
        state(   colName) { return InsertAndUpdated({colName,                       }); },
        zip(     colName) { return InsertAndUpdated({colName,                       }); },
        country( colName) { return InsertAndUpdated({colName,                       }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{street1: string, street2: string|null|undefined, city: string, state: string, zip: string,
     *          country: string, }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<CivicAddressRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.CivicAddressRecord = CivicAddressRecord).Setup();


class MultiAddressJoined extends RecordJoined {}
class MultiAddressRecord extends FeedRecord {
    #contact_id;
    #feed_item_id;
    static get TableName() { return 'MultiAddress'; }
    static get Joined() { return new MultiAddressJoined(this); }

    constructor({id, row_version, row_created, row_persisted,
                 contact_id, feed_item_id, backend_item_id,     street_1, street_2, city, state, zip, country}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#contact_id = contact_id;
        this.#feed_item_id = feed_item_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({backend_item_id,
                                                                street_1, street_2, city, state, zip, country});
        // Object.assign(this, { street_1, street_2, city, state, zip, country });
    }

    //region The get/set "interface": {  street1, street2, city, state, zip, country, ... }

    // noinspection JSUnusedGlobalSymbols
    get contact_id() { return this.#contact_id; }
    // noinspection JSUnusedGlobalSymbols
    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }

    // noinspection JSUnusedGlobalSymbols
    get backendItemId() { throw Error(`${this.Name}.prototype.get backendItemId() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set backendItemId(value) { throw Error(`${this.Name}.prototype.set backendItemId(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get street1() { throw Error(`${this.Name}.prototype.get street1() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set street1(value) { throw Error(`${this.Name}.prototype.set street1(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    // noinspection JSUnusedGlobalSymbols
    get street2() { throw Error(`${this.Name}.prototype.get street2() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set street2(value) { throw Error(`${this.Name}.prototype.set street2(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get city() { throw Error(`${this.Name}.prototype.get city() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set city(value) { throw Error(`${this.Name}.prototype.set city(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get state() { throw Error(`${this.Name}.prototype.get state() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set state(value) { throw Error(`${this.Name}.prototype.set state(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get zip() { throw Error(`${this.Name}.prototype.get zip() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set zip(value) { throw Error(`${this.Name}.prototype.set zip(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get country() { throw Error(`${this.Name}.prototype.get country() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set country(value) { throw Error(`${this.Name}.prototype.set country(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region litOb

    toOwnLitOb() {
        const {  contactId, feedItemId, backendItemId, street1, street2, city, state, zip, country } = this;
        return { contactId, feedItemId, backendItemId, street1, street2, city, state, zip, country };
    }

    toApiLitOb() {
        const {  feedItemId, backendItemId, street1, street2, city, state, zip, country } = this;
        return { feedItemId, backendItemId, street1, street2, city, state, zip, country };
    }

//  toOwnerApiLitOb()                   //  defaults to FeedRecord.prototype.toOwnerApiLitOb = thisProto.toApiLitOb
    static FromOwnedApiLitOb(ownedLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()
        const { feedItemId, backendItemId, street1, street2, city, state, zip, country, } = ownedLitOb;
        return {feedItemId, backendItemId, street1, street2, city, state, zip, country, };
    }

    //endregion

    static _OwnFields = {
        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwner of
        //  a .Joined MultiOwned() entry.  Editing is rather done via .whatever object.
        contact_id(     colName) {      return OnlyInserted({colName,                           }); },
        feed_item_id(   colName) {      return OnlyInserted({colName, recName:'feedItemId',     }); },

        backend_item_id(colName) {  return InsertAndUpdated({colName, recName:'backendItemId',  }); },
        street_1(       colName) {  return InsertAndUpdated({colName, recName:'street1',        }); },
        street_2(       colName) {  return InsertAndUpdated({colName, recName:'street2',        }); },
        city(           colName) {  return InsertAndUpdated({colName,                           }); },
        state(          colName) {  return InsertAndUpdated({colName,                           }); },
        zip(            colName) {  return InsertAndUpdated({colName,                           }); },
        country(        colName) {  return InsertAndUpdated({colName,                           }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{backendItemId: string|null|undefined, street1: string, street2: string|null|undefined, city: string,
     *          state: string, zip: string, country: string, }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<MultiAddressRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.MultiAddressRecord = MultiAddressRecord).Setup();


class ContactJoined extends RecordJoined {}
class ContactRecord extends FeedRecord {
    #feed_item_id;
    static get TableName() { return 'Contact'; }
    static get uuidDbName() { return 'feed_item_id'; }
    static get Joined() { return new ContactJoined(this); }

    constructor({id, row_version, row_created, row_persisted,  feed_item_id, backend_item_id,
                    last_name, first_name, middle_name,
                    preferred_gender, preferred_language, email, alternate_email, mobile_phone, land_phone, fax,
                    salutation, pro_salutation, titles, address_id,  }) {
        super({ id, row_version, row_created, row_persisted, });
        this.#feed_item_id = feed_item_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ backend_item_id,
                last_name, first_name, middle_name,
                preferred_gender, preferred_language, email, alternate_email, mobile_phone, land_phone, fax,
                salutation, pro_salutation, titles, address_id, });
        // Object.assign(this, { last_name, first_name, middle_name, preferred_gender, preferred_language, email,
        //          alternate_email, mobile_phone, land_phone, fax, salutation, pro_salutation, titles, address_id, });
    }

    //region The get/set "interface": {  feed_item_id,feedItemId,  lastName, firstName, middleName, ePreferredGender, preferredLanguage, email, alternateEmail, mobilePhone, landPhone, fax, salutation, proSalutation, titles, ... }

    // noinspection JSUnusedGlobalSymbols
    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }

    // noinspection JSUnusedGlobalSymbols
    get backendItemId() { throw Error(`${this.Name}.prototype.get backendItemId() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set backendItemId(value) { throw Error(`${this.Name}.prototype.set backendItemId(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get lastName() { throw Error(`${this.Name}.prototype.get lastName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set lastName(value) { throw Error(`${this.Name}.prototype.set lastName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get firstName() { throw Error(`${this.Name}.prototype.get firstName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set firstName(value) { throw Error(`${this.Name}.prototype.set firstName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get middleName() { throw Error(`${this.Name}.prototype.get middleName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set middleName(value) { throw Error(`${this.Name}.prototype.set middleName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get ePreferredGender() { throw Error(`${this.Name}.prototype.get ePreferredGender() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set ePreferredGender(value) { throw Error(`${this.Name}.prototype.set ePreferredGender(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get preferredLanguage() { throw Error(`${this.Name}.prototype.get preferredLanguage() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set preferredLanguage(value) { throw Error(`${this.Name}.prototype.set preferredLanguage(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get email() { throw Error(`${this.Name}.prototype.get email() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set email(value) { throw Error(`${this.Name}.prototype.set email(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get alternateEmail() { throw Error(`${this.Name}.prototype.get alternateEmail() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set alternateEmail(value) { throw Error(`${this.Name}.prototype.set alternateEmail(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get mobilePhone() { throw Error(`${this.Name}.prototype.get mobilePhone() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set mobilePhone(value) { throw Error(`${this.Name}.prototype.set mobilePhone(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get landPhone() { throw Error(`${this.Name}.prototype.get landPhone() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set landPhone(value) { throw Error(`${this.Name}.prototype.set landPhone(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get fax() { throw Error(`${this.Name}.prototype.get fax() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set fax(value) { throw Error(`${this.Name}.prototype.set fax(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get salutation() { throw Error(`${this.Name}.prototype.get salutation() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set salutation(value) { throw Error(`${this.Name}.prototype.set salutation(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get proSalutation() { throw Error(`${this.Name}.prototype.get proSalutation() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set proSalutation(value) { throw Error(`${this.Name}.prototype.set proSalutation(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get titles() { throw Error(`${this.Name}.prototype.get titles() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set titles(value) { throw Error(`${this.Name}.prototype.set titles(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region litOb

    toOwnLitOb() {
        const { feedItemId, backendItemId, lastName, firstName, middleName, ePreferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, salutation, proSalutation, titles } = this;
        return {feedItemId, backendItemId, lastName, firstName, middleName, ePreferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, salutation, proSalutation, titles };
    }

    toApiLitOb(apiLitOb={}) {   //  Full fledged version, just in case ContactRecord becomes a FeedItemRecord too.
        const { feedItemId, backendItemId, lastName, firstName, middleName, ePreferredGender:preferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, proSalutation, salutation, titles } = this;

        return super.toApiLitOb({
                feedItemId, backendItemId, lastName, firstName, middleName,                  preferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, proSalutation, salutation, titles,
                ...apiLitOb
        });
    }

    //  Full fledged version, distinct from .toApiLitOb(), just in case ContactRecord becomes a FeedItemRecord too.
    toOwnerApiLitOb(apiLitOb={}) {
        const { feedItemId, backendItemId, lastName, firstName, middleName, ePreferredGender:preferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, proSalutation, salutation, titles } = this;

        return this._addJoinedToApiLitOb({
                feedItemId, backendItemId, lastName, firstName, middleName,                  preferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, professionalSalutation:proSalutation, salutation, titles,
                ...apiLitOb
            });
    }

    static FromOwnedApiLitOb(ownedApiLitOb, ownedNativeLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()
        const { feedItemId, backendItemId, lastName, firstName, middleName, preferredGender:ePreferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, proSalutation, salutation, titles, } = ownedApiLitOb;

        return this._AddJoinedFromApiLitOb(ownedApiLitOb, {
                feedItemId, backendItemId, lastName, firstName, middleName,                 ePreferredGender, preferredLanguage,
                email, alternateEmail, mobilePhone, landPhone, fax, proSalutation, salutation, titles,
                ...ownedNativeLitOb,
        });
    }

    //endregion

    static _OwnFields = {
        feed_item_id(       colName) {      return OnlyInserted({colName, recName:'feedItemId',         }); },

        backend_item_id(    colName) {  return InsertAndUpdated({colName, recName:'backendItemId',      }); },
        last_name(          colName) {  return InsertAndUpdated({colName, recName:'lastName',           }); },
        first_name(         colName) {  return InsertAndUpdated({colName, recName:'firstName',          }); },
        middle_name(        colName) {  return InsertAndUpdated({colName, recName:'middleName',         }); },
        preferred_gender(   colName) {  return InsertAndUpdated({colName, recName:'ePreferredGender',   recEnum:EGender, }); },
        preferred_language( colName) {  return InsertAndUpdated({colName, recName:'preferredLanguage',  }); },
        email(              colName) {  return InsertAndUpdated({colName,                               }); },
        alternate_email(    colName) {  return InsertAndUpdated({colName, recName:'alternateEmail',     }); },
        mobile_phone(       colName) {  return InsertAndUpdated({colName, recName:'mobilePhone',        }); },
        land_phone(         colName) {  return InsertAndUpdated({colName, recName:'landPhone',          }); },
        fax(                colName) {  return InsertAndUpdated({colName,                               }); },
        salutation(         colName) {  return InsertAndUpdated({colName,                               }); },
        pro_salutation(     colName) {  return InsertAndUpdated({colName, recName:'proSalutation',      }); },
        titles(             colName) {  return InsertAndUpdated({colName,                               }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values, etc.
    /**
     * @param {{backendItemId: string|null|undefined,
     *          lastName: string|null|undefined, firstName: string|null|undefined, middleName: string|null|undefined,
     *          ePreferredGender: string|EGender|null|undefined, preferredLanguage: string|null|undefined,
     *          email: string|null|undefined, alternateEmail: string|null|undefined, mobilePhone: string|null|undefined,
     *          landPhone: string|null|undefined, fax: string|null|undefined, salutation: string|null|undefined,
     *          proSalutation: string|null|undefined, titles: string|null|undefined, feedItemId: string|null|undefined,
     *        }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<ContactRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {
        const { mobilePhone, landPhone, fax } = srcOb;
        Object.assign(srcOb, {
            mobilePhone : normalizePhoneNumber(mobilePhone),
            landPhone   : normalizePhoneNumber(landPhone),
            fax         : normalizePhoneNumber(fax),
        });

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }

}
ContactRecord.Setup = ReferencedFeedRecordSetup;
(self.ContactRecord = ContactRecord).Setup();


class FullContactJoined extends ContactJoined {
    address() {
        return UniOwned({FeedRecord:CivicAddressRecord, ownerProperty:this.address}); }
}
class FullContactRecord extends ContactRecord {

    static get Joined() { return new FullContactJoined(this); }

    //region The get/set "interface": { address }

    //  UniOwned

    get address() { throw Error(`${this.Name}.prototype.get address() : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region litOb

    toOwnLitOb() { return {}; }

//  toApiLitOb()                            //  ContactRecord's already include ._addJoinedToApiLitOb()
//  toOwnerApiLitOb()                       //  defaults to FeedRecord.prototype.toOwnerApiLitOb = thisProto.toApiLitOb
//  static FromOwnedApiLitOb(ownedLitOb)    //  ContactRecord's already include ._AddJoinedFromApiLitOb()

    //endregion

    static _OwnFields = {
        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwned|
        //  Owner of a .Joined UniOwned() entry, or as .colNameJoiningToReferenced of
        //  a .Joined Referenced() entry.  Editing is rather done via .whatever object.
        address_id( colName) {  return InsertAndUpdated({colName,                   }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{lastName: string|null|undefined, firstName: string|null|undefined, middleName: string|null|undefined,
     *          ePreferredGender: string|EGender|null|undefined, preferredLanguage: string|null|undefined,
     *          email: string|null|undefined, alternateEmail: string|null|undefined, mobilePhone: string|null|undefined,
     *          landPhone: string|null|undefined, fax: string|null|undefined, salutation: string|null|undefined,
     *          proSalutation: string|null|undefined, titles: string|null|undefined, feedItemId: string|null|undefined,
     *          address:{street1: string, street2: string|null|undefined, city: string, state: string, zip: string,
     *                   country: string, }|null|undefined,
     *        }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<ContactRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans});
    }

}
(self.FullContactRecord = FullContactRecord).Setup();


class MultiContactJoined extends FullContactJoined {
    addresses() {
        return MultiOwned({FeedRecord:MultiAddressRecord, ownerArrayProperty:this.addresses}); }
}
class MultiContactRecord extends FullContactRecord {
    #addresses=[];

    static get Joined() { return new MultiContactJoined(this); }
    //region The get/set "interface": { address }

    //  UniOwned

    get address() { throw Error(`${this.Name}.prototype.get address() : Not defined yet. Run ${this.Name}.Setup().`); }
    get addresses() { return this.#addresses; }

    //endregion

    //region litOb

    toOwnLitOb() { return {}; }

//  toApiLitOb()                            //  ContactRecord's already include ._addJoinedToApiLitOb()

    toOwnerApiLitOb() {
        const apiLitOb = super.toOwnerApiLitOb();
        const { addresses:[ address0, ]=[], address } = apiLitOb;
        apiLitOb.address = address ? address : address0;
        delete apiLitOb.addresses;

        return apiLitOb;
    }
    static FromOwnedApiLitOb(ownedApiLitOb) {
        const nativeLitOb = super.FromOwnedApiLitOb(ownedApiLitOb);
        const { address } = nativeLitOb;
        if (address) {
            ownedApiLitOb.addresses = [ address, ];
            delete nativeLitOb.address;
        }

        return nativeLitOb;
    }

    //endregion

    static _OwnFields = {
        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwned|
        //  Owner of a .Joined UniOwned() entry, or as .colNameJoiningToReferenced of
        //  a .Joined Referenced() entry.  Editing is rather done via .whatever object.
        address_id( colName) {  return InsertAndUpdated({colName,                   }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{lastName: string|null|undefined, firstName: string|null|undefined, middleName: string|null|undefined,
     *          ePreferredGender: string|EGender|null|undefined, preferredLanguage: string|null|undefined,
     *          email: string|null|undefined, alternateEmail: string|null|undefined, mobilePhone: string|null|undefined,
     *          landPhone: string|null|undefined, fax: string|null|undefined, salutation: string|null|undefined,
     *          proSalutation: string|null|undefined, titles: string|null|undefined, feedItemId: string|null|undefined,
     *          addresses:{street1: string, street2: string|null|undefined, city: string, state: string, zip: string,
     *                     country: string, }[]|null|undefined,
     *        }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<ContactRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans});
    }

}
(self.MultiContactRecord = MultiContactRecord).Setup();


class PatientLegitIdJoined extends RecordJoined {}
class PatientLegitIdRecord extends FeedRecord {
    #patient_id;
    #feed_item_id;
    static get TableName() { return 'PatientLegitId'; }
    static get Joined() { return new PatientLegitIdJoined(this); }

    constructor({id, row_version, row_created, row_persisted, patient_id, feed_item_id, backend_item_id, issuer_kind, issuer_alias, number, version, expires_on}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#patient_id = patient_id;
        this.#feed_item_id = feed_item_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ backend_item_id, issuer_kind, issuer_alias, number, version, expires_on });
        // Object.assign(this, { issuer_kind, issuer_alias, number, version, expires_on });
    }

    //region The get/set "interface": {  practitionerId, eIssuerKind, issuer, number, version, expiresOn, ... }

    // noinspection JSUnusedGlobalSymbols
    get patient_id() { return this.#patient_id; }
    // noinspection JSUnusedGlobalSymbols
    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }

    // noinspection JSUnusedGlobalSymbols
    get backendItemId() { throw Error(`${this.Name}.prototype.get backendItemId() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set backendItemId(value) { throw Error(`${this.Name}.prototype.set backendItemId(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

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
        const {  patientId, feedItemId, backendItemId, eIssuerKind, issuerAlias, number, version, expiresOn } = this;
        return { patientId, feedItemId, backendItemId, eIssuerKind, issuerAlias, number, version, expiresOn };
    }

    toApiLitOb() {
        const {  feedItemId, backendItemId, eIssuerKind, issuerAlias, number, version, expiresOn } = this;
        return { feedItemId, backendItemId, eIssuerKind, issuerAlias, number, version, expiresOn };
    }

    //  Being MultiOwned by PractitionerRecord, PractitionerLegitIdRecord must implement Owned "interface" :
    //
    //      toOwnerApiLitOb() {}
    //      static FromOwnedApiLitOb(litOb) {}

    //  How the FeedRecord is LitOb-ed when embedded in its owner.
    toOwnerApiLitOb() {
        const {   feedItemId, backendItemId, eIssuerKind:issuerKind, issuerAlias, number, version, expiresOn } = this;
        return {  feedItemId, backendItemId,             issuerKind, issuerAlias, number, version, expiresOn };
    }

    static FromOwnedApiLitOb(ownedApiLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()
        const {  feedItemId, backendItemId, issuerKind:eIssuerKind, issuerAlias, number, version, expiresOn, } = ownedApiLitOb;
        return { feedItemId, backendItemId,            eIssuerKind, issuerAlias, number, version, expiresOn, };
    }

    //endregion

    static _OwnFields = {
        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwner of
        //  a .Joined MultiOwned() entry.  Editing is rather done via .whatever object.
        patient_id(     colName) {      return OnlyInserted({colName,                           }); },
        feed_item_id(   colName) {      return OnlyInserted({colName, recName:'feedItemId',     }); },

        backend_item_id(colName) {  return InsertAndUpdated({colName, recName:'backendItemId',  }); },
        issuer_kind(    colName) {  return InsertAndUpdated({colName, recName:'eIssuerKind',    recEnum:EIssuerKind});},
        issuer_alias(   colName) {  return InsertAndUpdated({colName, recName:'issuerAlias',    }); },
        number(         colName) {  return InsertAndUpdated({colName,                           }); },
        version(        colName) {  return InsertAndUpdated({colName,                           }); },
        expires_on(     colName) {  return InsertAndUpdated({colName, recName:'expiresOn'       }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{backendItemId: string|null|undefined, eIssuerKind: string|EIssuerKind, issuerAlias: string,
     *          number: string, version: string|null|undefined, expiresOn: Date|null|undefined, }} srcOb
     * @param {string[]} validationErrors
     * @param {function} _dbInsert
     * @param {function} _fetchFromDb
     * @param {DbTransaction|null} trans
     * @returns {Promise<PatientLegitIdRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null }) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }   //  NOTE:   seq value is handled right by DB ON INSERT trigger.
}
(self.PatientLegitIdRecord = PatientLegitIdRecord).Setup();


class PatientJoined extends RecordJoined {
    primaryFeedPractitionerId() {
        return Referenced({FeedRecord:PractitionerRecord,referenceIdProperty:this.primaryFeedPractitionerId, referencePropertyName:'primaryPractitioner'}); }
    birthPlace() {
        return UniOwned({FeedRecord:BirthPlaceRecord,   ownerProperty:this.birthPlace,        ownerLitObName:'placeOfBirth',       colNameJoiningToOwned: 'birth_place_id'       }); }
    motherBirthPlace() {
        return UniOwned({FeedRecord:BirthPlaceRecord,   ownerProperty:this.motherBirthPlace,  ownerLitObName:'motherPlaceOfBirth', colNameJoiningToOwned: 'mother_birth_place_id'}); }
    /**
     *
     * @returns {{params: JoinedParams, Joined: FullContactJoined}}
     */
    selfContact() {
        return UniOwned({FeedRecord:FullContactRecord,  ownerProperty:this.selfContact,       ownerLitObName:'contact',               colNameJoiningToOwned: 'self_contact_id'      }); }
    emergencyContact() {
        return UniOwned({FeedRecord:ContactRecord,      ownerProperty:this.emergencyContact,                                          colNameJoiningToOwned: 'emergency_contact_id' }); }
    legitIds() {
        return MultiOwned({FeedRecord:PatientLegitIdRecord, ownerArrayProperty:this.legitIds, ownerLitObArrayName:'identifiedBy'}); }
}
class PatientRecord extends FeedItemRecord {
    #chart_number;
    #legitIds = [];
    static get TableName() { return 'Patient'; }
    static get Joined() { return new PatientJoined(this); }

    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                    chart_number, date_of_birth, birth_place_id, gender_at_birth, gender, date_of_death,
                    family_name_at_birth, first_name_at_birth, middle_name_at_birth,
                    family_name, first_name, middle_name, normalized_name,
                    mother_family_name_at_birth, mother_first_name_at_birth, mother_middle_name_at_birth,
                    mother_date_of_birth, mother_birth_place_id,
                    self_contact_id, emergency_contact_id, primary_practitioner_id, }) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});
        this.#chart_number = chart_number;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({
            date_of_birth, birth_place_id, gender_at_birth, gender, date_of_death,
            family_name_at_birth, first_name_at_birth, middle_name_at_birth,
            family_name, first_name, middle_name, normalized_name,
            mother_family_name_at_birth, mother_first_name_at_birth, mother_middle_name_at_birth,
            mother_date_of_birth, mother_birth_place_id,
            self_contact_id, emergency_contact_id, primary_practitioner_id });
        // Object.assign(this, {date_of_birth, birth_place_id, gender_at_birth, gender, date_of_death,
        //             family_name_at_birth, first_name_at_birth, middle_name_at_birth,
        //             family_name, first_name, middle_name, normalized_name,
        //             mother_family_name_at_birth, mother_first_name_at_birth, mother_middle_name_at_birth,
        //             mother_date_of_birth, mother_birth_place_id,
        //             self_contact_id, emergency_contact_id, primary_practitioner_id});
    }

    //region The get/set "interface": {  dateOfBirth, birthPlace, genderAtBirth, gender, familyNameAtBirth ... }

    get chart_number() { return this.#chart_number; }
    get chartNumber()  { return this.#chart_number; }


    get dateOfBirth() { throw Error(`${this.Name}.prototype.get dateOfBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set dateOfBirth(value) { throw Error(`${this.Name}.prototype.set dateOfBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get eGenderAtBirth() { throw Error(`${this.Name}.prototype.get eGenderAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set eGenderAtBirth(value) { throw Error(`${this.Name}.prototype.set eGenderAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get eGender() { throw Error(`${this.Name}.prototype.get eGender() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set eGender(value) { throw Error(`${this.Name}.prototype.set eGender(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get familyNameAtBirth() { throw Error(`${this.Name}.prototype.get familyNameAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set familyNameAtBirth(value) { throw Error(`${this.Name}.prototype.set familyNameAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get firstNameAtBirth() { throw Error(`${this.Name}.prototype.get firstNameAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set firstNameAtBirth(value) { throw Error(`${this.Name}.prototype.set firstNameAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get middleNameAtBirth() { throw Error(`${this.Name}.prototype.get middleNameAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set middleNameAtBirth(value) { throw Error(`${this.Name}.prototype.set middleNameAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get familyName() { throw Error(`${this.Name}.prototype.get familyName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set familyName(value) { throw Error(`${this.Name}.prototype.set familyName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    get firstName() { throw Error(`${this.Name}.prototype.get firstName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set firstName(value) { throw Error(`${this.Name}.prototype.set firstName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get middleName() { throw Error(`${this.Name}.prototype.get middleName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set middleName(value) { throw Error(`${this.Name}.prototype.set middleName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    // noinspection JSUnusedGlobalSymbols
    get normalizedName() { throw Error(`${this.Name}.prototype.get normalizedName() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set normalizedName(value) { throw Error(`${this.Name}.prototype.set normalizedName(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get motherFamilyNameAtBirth() { throw Error(`${this.Name}.prototype.get motherFamilyNameAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set motherFamilyNameAtBirth(value) { throw Error(`${this.Name}.prototype.set motherFamilyNameAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get motherFirstNameAtBirth() { throw Error(`${this.Name}.prototype.get motherFirstNameAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set motherFirstNameAtBirth(value) { throw Error(`${this.Name}.prototype.set motherFirstNameAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get motherMiddleNameAtBirth() { throw Error(`${this.Name}.prototype.get motherMiddleNameAtBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set motherMiddleNameAtBirth(value) { throw Error(`${this.Name}.prototype.set motherMiddleNameAtBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get motherDateOfBirth() { throw Error(`${this.Name}.prototype.get motherDateOfBirth() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set motherDateOfBirth(value) { throw Error(`${this.Name}.prototype.set motherDateOfBirth(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {*}
     */
    get dateOfDeath() { throw Error(`${this.Name}.prototype.get dateOfDeath() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set dateOfDeath(value) { throw Error(`${this.Name}.prototype.set dateOfDeath(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }


    // ===================================================

    //  UniOwned

    get birthPlace() { throw Error(`${this.Name}.prototype.get birthPlace() : Not defined yet. Run ${this.Name}.Setup().`); }

    get motherBirthPlace() { throw Error(`${this.Name}.prototype.get motherBirthPlace() : Not defined yet. Run ${this.Name}.Setup().`); }

    get selfContact() { throw Error(`${this.Name}.prototype.get selfContact() : Not defined yet. Run ${this.Name}.Setup().`); }

    get emergencyContact() { throw Error(`${this.Name}.prototype.get emergencyContact() : Not defined yet. Run ${this.Name}.Setup().`); }

    //  Referenced

    // noinspection JSUnusedGlobalSymbols
    get primaryFeedPractitionerId() { throw Error(`${this.Name}.prototype.get primaryFeedPractitionerId() : Not defined yet. Run ${this.Name}.Setup().`); }

    //  MultiOwned

    get legitIds() { return this.#legitIds; }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  chartNumber, dateOfBirth, eGenderAtBirth, eGender, familyNameAtBirth, firstNameAtBirth,
            middleNameAtBirth, familyName, firstName, middleName, normalizedName, motherFamilyNameAtBirth,
            motherFirstNameAtBirth, motherMiddleNameAtBirth, motherDateOfBirth, dateOfDeath, } = this;

        return { chartNumber, dateOfBirth, eGenderAtBirth, eGender, familyNameAtBirth, firstNameAtBirth,
            middleNameAtBirth, familyName, firstName, middleName, normalizedName, motherFamilyNameAtBirth,
            motherFirstNameAtBirth, motherMiddleNameAtBirth, motherDateOfBirth, dateOfDeath, };
    }

    toNonRetiredApiLitOb() {
        const { chartNumber, dateOfBirth, eGenderAtBirth, eGender, familyNameAtBirth, firstNameAtBirth,
            middleNameAtBirth, familyName, firstName, middleName, motherFamilyNameAtBirth,
            motherFirstNameAtBirth, motherMiddleNameAtBirth, motherDateOfBirth, dateOfDeath,  } = this;

        const apiLitOb =  super.toNonRetiredApiLitOb({
            chartNumber,
            demographics: {
                dateOfBirth,
                placeOfBirth: {},
                genderAtBirth : eGenderAtBirth,
                gender        : eGender,
                name: { familyName, firstName, middleName },
                nameAtBirth: {
                    familyName: familyNameAtBirth,
                    firstName : firstNameAtBirth,
                    middleName: middleNameAtBirth,
                },
                motherNameAtBirth: (motherFamilyNameAtBirth || motherFirstNameAtBirth || motherMiddleNameAtBirth) ? {
                    familyName: motherFamilyNameAtBirth,
                    firstName : motherFirstNameAtBirth,
                    middleName: motherMiddleNameAtBirth
                } : undefined,
                motherDateOfBirth,
                motherPlaceOfBirth: {},
                dateOfDeath,
            },
            locatedWith: {},
            // identifiedBy,
            // primaryFeedPractitionerId,
        });

        //  super.toNonRetiredApiLitOb() called this._addJoinedToApiLitOb() which added : (
        //      .placeOfBirth, .motherPlaceOfBirth, .selfContact, .emergencyContact,
        //      .identifiedBy, .primaryFeedPractitionerId
        //  )
        //  at the top level of the returned apiLitOb.
        //
        //  .identifiedBy and .primaryFeedPractitionerId are already at the right place. The rest is moved :

        //  NOTE    placeholders have been used in the above apiLitOb, to place .demographics.placeOfBirth
        //          and .demographics.motherPlaceOfBirth at a precise location in .demographics, and
        //          .identifiedBy at a precise location inside apiLitOb. If placeholder haven't been used,
        //          the following code would have been simpler.

        const { placeOfBirth, motherPlaceOfBirth, contact, emergencyContact, } = apiLitOb;
        if (placeOfBirth) {
            Object.assign(apiLitOb.demographics.placeOfBirth, placeOfBirth);
            delete apiLitOb.placeOfBirth;
        }
        else delete apiLitOb.demographics.placeOfBirth;         //  the empty place-holder inserted above

        if (motherPlaceOfBirth) {
            Object.assign(apiLitOb.demographics.motherPlaceOfBirth, motherPlaceOfBirth);
            delete apiLitOb.motherPlaceOfBirth;
        }
        else delete apiLitOb.demographics.motherPlaceOfBirth;   //  the empty place-holder inserted above

        let address;
        if (contact) {
            ({address} = contact);
            delete contact.address;
            delete apiLitOb.contact;
        }
        if (contact || emergencyContact || address) {
            Object.assign(apiLitOb.locatedWith, {contact, address, emergencyContact,});
            delete apiLitOb.emergencyContact;
        }
        else delete apiLitOb.locatedWith;                       //  the empty place-holder inserted above

        return apiLitOb;
    }

    static FromNonRetiredApiLitOb(apiLitOb) {
        //  Mostly property name matching, the rest of validateNMorphToCol() is done in recToCol()
        const {
            demographics: {
                dateOfBirth,
                genderAtBirth : eGenderAtBirth,
                gender        : eGender,
                placeOfBirth,
                name: { familyName, firstName, middleName, }={},
                nameAtBirth: {
                    familyName: familyNameAtBirth,
                    firstName : firstNameAtBirth,
                    middleName: middleNameAtBirth,
                }={},
                motherNameAtBirth : {
                    familyName: motherFamilyNameAtBirth,
                    firstName : motherFirstNameAtBirth,
                    middleName: motherMiddleNameAtBirth,
                }={},
                motherDateOfBirth,
                motherPlaceOfBirth,
                dateOfDeath
            }={},
            locatedWith : { contact, address, emergencyContact, }={},
            // identifiedBy,                    //  already at the right place;
            // primaryFeedPractitionerId,
        } = apiLitOb;

        if (contact) {
            contact.address = address;                                  //  Change embedding level of address in litOb
        }

        //    'this' is the static This: the class, not the instance.
        return super.FromNonRetiredApiLitOb(Object.assign(apiLitOb,
            //  Moved to top level of apiLitOb, for super.FromNonRetiredApiLitOb(), and ._AddJoinedFromApiLitOb() to find them.
            { placeOfBirth, motherPlaceOfBirth, contact, emergencyContact }), {
            dateOfBirth,
            eGenderAtBirth,
            eGender,
            familyNameAtBirth, firstNameAtBirth, middleNameAtBirth, familyName, firstName, middleName,
            motherFamilyNameAtBirth, motherFirstNameAtBirth, motherMiddleNameAtBirth, motherDateOfBirth,
            dateOfDeath
        });
    }   //  apiLitOb is not cleaned up afterward.

    //endregion

    static _OwnFields = {
        chart_number(               colName) {      return OnlyInserted({colName, recName:'chartNumber'         }); },

        date_of_birth(              colName) {  return InsertAndUpdated({colName, recName:'dateOfBirth',        }); },
        gender_at_birth(            colName) {  return InsertAndUpdated({colName, recName:'eGenderAtBirth',     recEnum:EGender,}); },
        gender(                     colName) {  return InsertAndUpdated({colName, recName:'eGender',            recEnum:EGender,}); },
        family_name_at_birth(       colName) {  return InsertAndUpdated({colName, recName:'familyNameAtBirth',  }); },
        first_name_at_birth(        colName) {  return InsertAndUpdated({colName, recName:'firstNameAtBirth',   }); },
        middle_name_at_birth(       colName) {  return InsertAndUpdated({colName, recName:'middleNameAtBirth',  }); },
        family_name(                colName) {  return InsertAndUpdated({colName, recName:'familyName',         }); },
        first_name(                 colName) {  return InsertAndUpdated({colName, recName:'firstName',          }); },
        middle_name(                colName) {  return InsertAndUpdated({colName, recName:'middleName',         }); },
        normalized_name(            colName) {  return InsertAndUpdated({colName, recName:'normalizedName',     }); },
        mother_family_name_at_birth(colName) {  return InsertAndUpdated({colName, recName:'motherFamilyNameAtBirth',}); },
        mother_first_name_at_birth( colName) {  return InsertAndUpdated({colName, recName:'motherFirstNameAtBirth', }); },
        mother_middle_name_at_birth(colName) {  return InsertAndUpdated({colName, recName:'motherMiddleNameAtBirth',}); },
        mother_date_of_birth(       colName) {  return InsertAndUpdated({colName, recName:'motherDateOfBirth',  }); },
        date_of_death(              colName) {  return InsertAndUpdated({colName, recName:'dateOfDeath',        }); },

        //  No .recName provided/necessary: the .whateverId getter & setter are NOT
        //  defined for any .whatever_id which is specified as .colNameJoiningToOwned|
        //  Owner of a .Joined UniOwned() entry, or as .colNameJoiningToReferenced of a
        //  .Joined Referenced() entry.  Editing is rather done via .whatever object.
        birth_place_id(             colName) {  return InsertAndUpdated({colName,   }); },
        mother_birth_place_id(      colName) {  return InsertAndUpdated({colName,   }); },
        self_contact_id(            colName) {  return InsertAndUpdated({colName,   }); },
        emergency_contact_id(       colName) {  return InsertAndUpdated({colName,   }); },
        primary_practitioner_id(    colName) {  return InsertAndUpdated({colName,   }); },
    };

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{feedAlias: string, feedItemId: string|null|undefined, backendItemId: string|null|undefined,
     *          chartNumber: string|null|undefined, dateOfBirth: string|Date,
     *          eGender: string|EGender, eGenderAtBirth: string|EGender|null|undefined,
     *          familyName: string, firstName: string, middleName: string|null|undefined,
     *          familyNameAtBirth: string|null|undefined, firstNameAtBirth: string|null|undefined,
     *          middleNameAtBirth: string|null|undefined,       dateOfDeath: string|Date|null|undefined,
     *          motherFamilyNameAtBirth: string|null|undefined, motherFirstNameAtBirth: string|null|undefined,
     *          motherMiddleNameAtBirth: string|null|undefined, motherDateOfBirth: string|Date|null|undefined,
     *          birthPlace: {street1: string|null|undefined, street2: string|null|undefined, city: string|null|undefined,
     *                      state: string|null|undefined, zip: string|null|undefined, country: string}|undefined|null,
     *          motherBirthPlace: {street1: string|null|undefined, street2: string|null|undefined, city: string|null|undefined,
     *                             state: string|null|undefined, zip: string|null|undefined, country: string}|undefined|null,
     *          selfContact: {lastName: string|null|undefined, firstName: string|null|undefined,
     *                        middleName: string|null|undefined, ePreferredGender: string|EGender|null|undefined,
     *                        preferredLanguage: string|null|undefined, email: string|null|undefined,
     *                        alternateEmail: string|null|undefined, mobilePhone: string|null|undefined,
     *                        landPhone: string|null|undefined, fax: string|null|undefined,
     *                        salutation: string|null|undefined, proSalutation: string|null|undefined,
     *                        titles: string|null|undefined, feedItemId: string|null|undefined,
     *                        address:{street1: string, street2: string|null|undefined, city: string, state: string,
     *                                 zip: string, country: string, }|null|undefined, }|undefined|null,
     *          emergencyContact: {lastName: string|null|undefined, firstName: string|null|undefined,
     *                        middleName: string|null|undefined, ePreferredGender: string|EGender|null|undefined,
     *                        preferredLanguage: string|null|undefined, email: string|null|undefined,
     *                        alternateEmail: string|null|undefined, mobilePhone: string|null|undefined,
     *                        landPhone: string|null|undefined, fax: string|null|undefined,
     *                        salutation: string|null|undefined, proSalutation: string|null|undefined,
     *                        titles: string|null|undefined, feedItemId: string|null|undefined, }|null|undefined,
     *          primaryFeedPractitionerId: string|null|undefined,
     *          legitIds:{eIssuerKind: string|EIssuerKind, issuerAlias: string, number: string,
     *                    version: string|null|undefined, expiresOn: Date|null|undefined,}[]|null|undefined,
     *          }} srcOb
     * @param {string[]} validationErrors
     * @returns {Promise<PatientRecord>}
     * @constructor
     */
    static async Insert({srcOb, validationErrors=[]}) {

        const { eGender,             familyName, firstName, middleName,         //  never null, most likely candidate
                chartNumber=null,
            // if undefined or null, override with most likely candidate value.
                eGenderAtBirth=null, familyNameAtBirth=null, firstNameAtBirth=null, middleNameAtBirth=null,
                selfContact=null } = srcOb;

        if (selfContact !== null  &&  'object' !== typeof selfContact) {
            WrongType(`${this.FeedItemName} property .selfContact must be an object, null or undefined`);
        }

        // noinspection JSCheckFunctionSignatures
        Object.assign(srcOb, {  //  set default non-null '' for chartNumber, INSERT TRIGGER will handle the rest.
            chartNumber : null !== chartNumber ? chartNumber :  '',

            eGenderAtBirth   : null !== eGenderAtBirth     ?  eGenderAtBirth     :  eGender,
            familyNameAtBirth: null !== familyNameAtBirth  ?  familyNameAtBirth  :  familyName,
            firstNameAtBirth : null !== firstNameAtBirth   ?  firstNameAtBirth   :  firstName,
            middleNameAtBirth: null !== middleNameAtBirth  ?  middleNameAtBirth  :  middleName,

            //  todo: ideally, normalizeName() would be a DB PROCEDURE, TRIGGERed on INSERT and UPDATE.
            normalizedName: normalizeName(familyName, firstName, middleName),               //  add normalizedName

            selfContact:null === selfContact  ?  undefined   :                              //  if undefined or null
                        (({ lastName:scLastName=null, firstName:scFirstName=null,
                             middleName:scMiddleName=null, ePreferredGender=null,}) =>

                                    Object.assign(selfContact, {
                                        lastName        : null !== scLastName        ?  scLastName        :  familyName,
                                        firstName       : null !== scFirstName       ?  scFirstName       :  firstName,
                                        middleName      : null !== scMiddleName      ?  scMiddleName      :  middleName,
                                        ePreferredGender: null !== ePreferredGender  ?  ePreferredGender  :  eGender,
                                })   //  if undefined or  null,  override with most likely candidate value.
                        )(    selfContact    ),   //  neither undefined nor null
        });

        return await super.Insert({ srcOb, validationErrors });
    }

    async update() {
        //  The practitionerLegitIds are really a part of the practitioner. Update them first.

        return await super.update();    //  finish with that so .rowPersisted is the most recent and covers all.
    }

    // async addLegitId({eIssuerKind, issuerAlias, number, version, expiresOn}) {
    //     const { id } = this;
    //     return await PractitionerLegitIdRecord.Insert({id, srcOb:{ eIssuerKind, issuerAlias, number, version, expiresOn }});
    // }

    /**
     *
     * @param phoneNumber
     * @returns {Promise<PatientRecord[]>}
     * @constructor
     */
    static async GetByPhoneNumber(phoneNumber) {            //  'this' is the static This: the class, not the instance.

        phoneNumber = normalizePhoneNumber(phoneNumber);

        return await this.GetWithCriteria((       //  Add ._RecordSchema with all the right props to auto do the job.
                        ` LEFT JOIN \`Contact\` ON \`Patient\`.\`self_contact_id\` = \`Contact\`.\`id\`\n`+
                        `WHERE  \`Contact\`.\`mobile_phone\` = ?  OR  \`Contact\`.\`land_phone\` = ?`), [
                                                     phoneNumber,                        phoneNumber ]);
    }
}
(self.PatientRecord = PatientRecord).Setup();

if ([false, true][ 0 ]) {
    for (let patientLitOb of [{
        feedAlias      : 'creamedDP',
        dateOfBirth: new Date('1970-07-19'),
        eGender: eGenderF,
        eGenderAtBirth: eGenderN,
        firstName  : 'Chaperon',
        familyName : 'Rouge',
        legitIds   : [
            {
                eIssuerKind: eIssuerHealthCare,
                issuerAlias: "CA_QC_RAMQ",
                number: "ROUC70571903",
            }
        ]
    }, ]) {
        const validationErrors =[];
        PatientRecord.Insert({srcOb:patientLitOb, validationErrors}
        ).then(patientRecord => {
            logger.info(`Inserted patientRecord : ${patientRecord.toFullOwnJSON()}`);
            // patientRecord.retire().then(updatedCnt => {
            //     logger.info(`patientRecord : ${patientRecord.toNiceJSON()}`);
            // });
        }).catch(e => logger.error(`PatientRecord.Insert()`, dbMsg(e)));
    }
}
else if ([false, true][ 0 ]) {
    const firstName = ['Chaperon','Chaperonnette', 'Méchant', 'Almedia', ][ 3 ];
    PatientRecord.GetByPhoneNumber(['(635) 753-1073'][ 0 ]
    // PatientRecord.GetWithCriteria('WHERE Patient.first_name = ?', [firstName]
    ).then(records => {
        for (let record of records) {
            logger.info(`Fetched patientRecord : ${record.toNiceJSON()}`);
            logger.info(`Fetched patientRecord row : ${record.toRowJSON()}`);
            logger.info(`Fetched patientRecord own : ${record.toOwnJSON()}`);
            logger.info(`Fetched patientRecord native : ${record.native.toJSON()}`);
            logger.info(`Fetched patientLegitIdRecord : ${record.legitIds[0].toRowJSON()}`);

            [   PatientRecord.Joined.birthPlace(),PatientRecord.Joined.motherBirthPlace(), PatientRecord.Joined.selfContact(),
                PatientRecord.Joined.primaryFeedPractitionerId(), record.birthPlace, record.motherBirthPlace
            ].join();    // Kludge to kill "unused" warnings.

            if (record.legitIds[0].HasRowRetiredField) {
                record.legitIds[0].retire().catch(e => logger.error(e.message));
            }
        }
        if (records.length) {
            if ([false, true][ 0 ]) {                                           //  WARNING  :  DELETE ! ! !
                const rec =  records[records.length-1];
                rec.delete().then(() =>{
                    logger.info(`Deleted patientRecord : ${rec.toFullOwnJSON()}`);

                }).catch(e =>
                    logger.error(`PatientRecord.delete(id=${rec.id}')`, e));
            }
            else {
                if ([false, true][ 0 ]) {
                    const rec =  records[0], newName = ['Chaperon', 'Chaperonnette'][ 0 ];
                    rec.lastName = newName;
                    logger.info(`Changed patientRecord row : ${rec.toRowJSON()}`);

                    rec.update().then(({row_persisted, row_version}) => {
                        logger.info(`Updated patientRecord (v.${row_version}, ${row_persisted}) : ${rec.toNiceJSON()}`);
                    }).catch(e => logger.error(`PatientRecord.update(lastName = '${newName}')`, e));
                }
            }
        }
    }).catch(e => logger.error(`PatientRecord.GetWithCriteria(first_name = '${firstName}')`, e))
}
else if ([false, true][ 0 ]) {
    const s0 = {sql:`SELECT MultiAddress.* FROM Patient
    LEFT JOIN Contact ON Patient.self_contact_id = Contact.id OR Patient.emergency_contact_id = Contact.id 
    JOIN MultiAddress ON Contact.id = MultiAddress.contact_id
    WHERE Patient.id = ?`,  nestTables: true};

    const s1= {sql:`SELECT MultiAddress.* FROM Patient
    JOIN MultiAddress ON Patient.self_contact_id = MultiAddress.contact_id OR Patient.emergency_contact_id = MultiAddress.contact_id
    WHERE Patient.id = ?`,  nestTables: true};

    const s2= {sql:`SELECT MultiAddress.* FROM Patient
    JOIN MultiAddress ON Patient.self_contact_id = MultiAddress.contact_id OR Patient.emergency_contact_id = MultiAddress.contact_id
    WHERE Patient.feed_alias = ? AND Patient.row_persisted >= ?
    ORDER BY Patient.row_persisted, Patient.id LIMIT ? OFFSET ?`,  nestTables: true};

    const s3 = {sql:  `SELECT MultiAddress.*`+
                    `\n  FROM ( SELECT * FROM Patient`+
                    `\n          WHERE Patient.feed_alias = ? AND Patient.row_persisted >= ?`+
                    `\n          ORDER BY Patient.row_persisted, Patient.id LIMIT ? OFFSET ? ) AS Patient`+
                    `\n  LEFT JOIN Contact ON Patient.self_contact_id = Contact.id OR Patient.emergency_contact_id = Contact.id`+
                    `\n  JOIN MultiAddress ON Contact.id = MultiAddress.contact_id`,  nestTables: true};

    const s4 = {sql:  `SELECT MultiAddress.*`+
                    `\n  FROM ( SELECT * FROM Patient`+
                    `\n          WHERE Patient.id = ?) AS Patient`+
                    `\n  JOIN MultiAddress ON  Patient.self_contact_id = MultiAddress.contact_id  OR  Patient.emergency_contact_id = MultiAddress.contact_id`,  nestTables: true};

    const s = [s0,s1,s2,s3,s4];
    fetchFromDb(s[ 4 ],[[ 17, 18 ][ 0 ],['creamedDP', new Date(['1979-01-01', '2020-06-07T00:20:00.000Z'][ 1 ]), 10, 0]]
                 [ 0 ])
        .then(rows => {
            for (let row of rows) {
                logger.debug(row, 'plusss', row[''] );
            }
        }).catch( e =>
        logger.error(`Fetching MultiAddress : `, dbMsg(e)));
}

logger.trace("Initialized ...");
