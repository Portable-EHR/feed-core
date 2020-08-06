/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);
const { v1: uuidv1 } = require('uuid');


const { tableSchema, pool:{config:{connectionConfig:{database:databaseName}}} } = require('../../lib/node');
const { zip, strToDate, capitalizeName, niceJSON,
        dbMsg, ErrorExtender, DeclareExpectedError, } = require('../../nodeCore/lib/utils');
const { doInTransaction, dbInsert, fetchFromDb, dbUpdate, dbDelete,
        CURRENT_TIMESTAMP_3:CURRENT_TIMESTAMP, NoRow, parseTableSchema, EDbJsType } = require('../../nodeCore/lib/dao');
const {
    number: eNumberDbJsType,
    boolean:eBooleanDbJsType,
    string: eStringDbJsType,
    // binary: eBinaryDbJsType,
    date:   eDateDbJsType,
    Enum:  eEnumDbJsType,
    uuid:   eUuidDbJsType,
    sha:    eShaDbJsType,
} = EDbJsType;

const { EFeedRequestStatus, FeedApiResponse, } = require('../../nodeCore/lib/api');
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


function UpdateConflict(message='', conflicts) {
    return ErrorExtender(message, UpdateConflict, {conflicts});
}
DeclareExpectedError(self.UpdateConflict = UpdateConflict);

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

function NotForUpdate(message) {
    return ErrorExtender(message, NotForUpdate);
}
DeclareExpectedError(self.NotForUpdate = NotForUpdate);

function NotFound(message) {
    return ErrorExtender(message, NotFound);
}
DeclareExpectedError(self.NotForUpdate = NotFound);

function Validation(message, validationErrors) {
    return ErrorExtender(message, Validation, {validationErrors});
}
DeclareExpectedError(self.Validation = Validation);


const handleApiError = self.handleApiError = (e, msg) => {
    if (e instanceof NoRow) {
        const { message } = e;
        e.feedOp = {
            handleApiError: e =>
                                ({ logMsg           : `${e.message} ${msg}`,
                                    ownApiResponse  : FeedApiResponse({status: eFeedRequestStatusNotFound, message}) }),
        };
    }
    else if (e.sql) {
        e.feedOp = {
            handleApiError: e =>
                                ({ logMsg           : `${msg} : ${dbMsg(e)}`,
                                    ownApiResponse  : FeedApiResponse({ status  : eFeedRequestStatusInternal,
                                                                        message : `sql error ${msg}`            }), }),
        };
    }

    throw e;
};

/**
 *
 * @param {object}mapOb
 * @param {FeedRecord} record
 * @param {string}tblName
 * @returns {*}
 */
const assignRecordMap = (mapOb, record, tblName) =>
                                                    mapOb[tblName].set(record[record.idDbName], record);
/**
 *
 * @param {object} mapOb
 * @returns {function(FeedRecord):FeedRecord}
 */
const recordMapper = (mapOb) =>
                                (record, tblName=record.TableName) => {
                                    try {
                                        assignRecordMap(mapOb, record, tblName);
                                    }
                                    catch (e) {
                                        if (e instanceof TypeError  &&  e.message.endsWith('of undefined')) {
                                            mapOb[tblName] = new Map();
                                            assignRecordMap(mapOb, record, tblName);
                                        }
                                        else throw e;
                                    }
                                    return record;
                                };

//region ShaAndUuid

const hexHyphen = '__';
const hexSuffix = '_hex';
const shaAndUuidFullName = (tblFullName, colName) =>
                                                     tblFullName + hexHyphen + colName + hexSuffix;

const keepShaAndUuidFields = field => ( {   //  Default to undefined: filteredOut
                                            [eUuidDbJsType] : true,
                                            [eShaDbJsType]  : true,
                                        }[field.eType]              );

const shaAndUuidSelectFcn = (tblName, shaAndUuidFields) =>
                                                            shaAndUuidFields.reduce(
        (  select, {colName, eType}) =>
                    select + ( {   //  uuid and sha special select string
                                    [eUuidDbJsType]:', BIN_TO_UUID(`'+tblName +'`.`'+colName +'`,1) AS `'+shaAndUuidFullName(tblName,colName)+'`',
                                    //  e.g.        ', BIN_TO_UUID(`Practitioner`.`feed_item_id`,1) AS `Practitioner__feed_item_id_hex`',
                                    [eShaDbJsType] :', HEX(`'+tblName+'`.`'+colName+'`) AS `'+shaAndUuidFullName(tblName,colName)+'`',
                                }[eType] ),
/*initial  select  empty string:*/ '');

const shaAndUuidNamesFnc = (shaAndUuidFields, tblFullName) =>
                                    shaAndUuidFields.map(
                                                        ({colName}) =>
                                                                       shaAndUuidFullName(tblFullName, colName));

const shaAndUuidRowFixerFnc = (shaAndUuidFields, tblName) =>
                                    shaAndUuidFields.map(
                                                        ({colName}) =>
                                                                       [colName, shaAndUuidFullName(tblName, colName)]);

const fixShaAndUuidOfRow =  (row, shaAndUuidRowFixer) => {
    //  override useless binary colName value with colName_hex string value if it's not undefined

    for (let [colName, colName_hex] of shaAndUuidRowFixer) {
        const hexValue = row[colName_hex];
        if (  hexValue !== undefined  ) {
            row[colName] = hexValue;
        }
    }// e.g. practitionerRow[backend_item_id] = practitionerRow[backend_item_id_hex];
    return row;
};

const nextTblPrefix = tblPrefix => tblPrefix+'_';

//endregion

//region ReferencedFeedRecordParams, UniOwnedFeedRecordParams, MultiOwnedFeedRecordParams,

//region ReferencedFeedRecordParamsProto
const ReferencedFeedRecordParamsProto = {
    get Record()            { return this.ReferencedFeedItemRecord; },
    get propertyName()      { return this.referenceIdPropertyName; },
    get litObName()         { return this.referenceIdLitObName; },
    get referenceIdColName(){ return this.ReferencedFeedItemRecord.uuidDbName; },
    isReferenced  : true,
};
const ReferencedFromReferencerFeedRecordParamsProto = Object.defineProperties({
    get colNameJoiningTo()          { return this.colNameJoiningToReferenced; },
    get colNameJoinedIn()           { return this.colNameJoinedInReferenced; },
    joinedFromReferencerToReferenced : true,
}, Object.getOwnPropertyDescriptors(ReferencedFeedRecordParamsProto));

const ReferencedFromReferencedFeedRecordParamsProto = Object.defineProperties({
    get colNameJoiningTo()          { return this.colNameJoiningToReferencer; },
    get colNameJoinedIn()           { return this.colNameJoinedInReferencer; },
    joinedFromReferencedToReferencer : true,
}, Object.getOwnPropertyDescriptors(ReferencedFeedRecordParamsProto));
//endregion

/**
 *
 * @param {{ReferencedFeedItemRecord:FeedItemRecord, referencePropertyName:string, referenceIdPropertyName:string,
 *          referenceIdLitObName:string, colNameJoiningToReferenced: string, colNameJoinedInReferenced: string,
 *          recNameJoiningTo:string, }} params
 * @returns {object}
 */
function ReferencedFromReferencerFeedRecordParams(params) {
    const o = Object.create(ReferencedFromReferencerFeedRecordParamsProto);
    Object.assign(o, params);
    return o;
}
ReferencedFromReferencerFeedRecordParams.chainProto();

/**
 *
 * @param {{ReferencedFeedItemRecord:FeedItemRecord, referencePropertyName:string, referenceIdPropertyName:string,
 *          referenceIdLitObName:string, colNameJoiningToReferencer: string, colNameJoinedInReferencer: string,
 *          recNameJoiningTo:string, }} params
 * @returns {object}
 */
function ReferencedFromReferencedFeedRecordParams(params) {
    const o = Object.create( ReferencedFromReferencedFeedRecordParamsProto);
    Object.assign(o, params);
    return o;
}
ReferencedFromReferencedFeedRecordParams.chainProto();


//region UniOwnedFeedRecordParamsProto

const UniOwnedFeedRecordParamsProto = {
    get Record()            { return this.UniOwnedFeedRecord; },
    get propertyName()      { return this.ownerPropertyName; },
    get litObName()         { return this.ownerLitObName; },
    isUniOwned  : true,
};
const UniOwnedFromOwnerFeedRecordParamsProto = Object.defineProperties({
    get colNameJoiningTo()          { return this.colNameJoiningToOwned; },
    get colNameJoinedIn()           { return this.colNameJoinedInOwned; },
    joinedFromOwnerToOwned : true,
}, Object.getOwnPropertyDescriptors(UniOwnedFeedRecordParamsProto));

const FromOwnedFeedRecordParamsProto = {
    get colNameJoiningTo()          { return this.colNameJoiningToOwner; },
    get colNameJoinedIn()           { return this.colNameJoinedInOwner; },
    joinedFromOwnedToOwner : true,
};
const UniOwnedFromOwnedFeedRecordParamsProto =  Object.defineProperties(Object.defineProperties({},
                                                    Object.getOwnPropertyDescriptors(UniOwnedFeedRecordParamsProto)),
                                                    Object.getOwnPropertyDescriptors(FromOwnedFeedRecordParamsProto));
//endregion

/**
 *
 * @param {{UniOwnedFeedRecord:FeedRecord, ownerPropertyName:string, ownerLitObName:string,
 *          colNameJoiningToOwned: string, colNameJoinedInOwned: string, recNameJoiningTo:string,
 *          joiningColNameCanBeNull:boolean,}} params
 * @returns {object}
 */
function UniOwnedFromOwnerFeedRecordParams(params) {
    const o = Object.create(UniOwnedFromOwnerFeedRecordParamsProto);
    Object.assign(o, params);
    return o;
}
UniOwnedFromOwnerFeedRecordParams.chainProto();

/**
 *
 * @param {{UniOwnedFeedRecord:FeedRecord, ownerPropertyName:string, ownerLitObName:string,
 *          colNameJoiningToOwner: string, colNameJoinedInOwner: string, recNameJoiningTo:string,
 *          joiningColNameCanBeNull:boolean, }} params
 * @returns {object}
 */
function UniOwnedFromOwnedFeedRecordParams(params) {
    const o = Object.create( UniOwnedFromOwnedFeedRecordParamsProto);
    Object.assign(o, params);
    return o;
}
UniOwnedFromOwnedFeedRecordParams.chainProto();


const MultiOwnedFeedRecordParamsProto = Object.defineProperties({
    get Record()            { return this.MultiOwnedFeedRecord; },
    get propertyName()      { return this.ownerArrayPropertyName; },
    get litObName()         { return this.ownerLitObArrayName; },
    isMultiOwned: true,
}, Object.getOwnPropertyDescriptors(FromOwnedFeedRecordParamsProto));

/**
 *
 * @param {{MultiOwnedFeedRecord:FeedRecord, ownerArrayPropertyName:string, ownerLitObArrayName:string,
 *          colNameJoiningToOwner: string, colNameJoinedInOwner: string, recNameJoiningTo:string,
 *          joiningColNameCanBeNull:boolean, }} params
 * @returns {object}
 */
function MultiOwnedFeedRecordParams(params) {
    const o = Object.create(MultiOwnedFeedRecordParamsProto);
    Object.assign(o,params);
    return o;
}
MultiOwnedFeedRecordParams.chainProto();

//endregion

class FeedRecord {
    #id;
    #row_version;
    #row_created;
    #row_persisted;     //  row_persisted means either INSERT-ed or UPDATE-d.
    #row_retired;

    #toUpdate;

    constructor({id, row_version, row_created, row_persisted, row_retired}) {
        this.#id = id;
        this.#row_version = row_version;
        this.#row_created = row_created;
        this.#row_persisted = row_persisted;
        this.#row_retired = row_retired;        //  May well be undefined if DB Table has no row_retired column.

        this.#toUpdate = {};    //  Can't be a new Map(); must be interchangeable with row/rowPart argument of some fnc.
    }

    static get Name() { const This = this; return This.name; }
    get Name() { return this.constructor.name; }

    /**
     *
     * @returns {string}
     */
    static get TableName() { throw Error(`${this.Name}.get TableName() : Not defined yet. Override Me !`); }

    static get FeedItemName() { return this.Name; }                                     //  Candidate for overriding !
    get FeedItemName() { return this.Name; }                                            //  Candidate for overriding !

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
        // e.g.{ colName:"mother_id",       recName:"motherId",                             }
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
        // e.g.{ colName:"gender",          recName:"eGender",          recEnum:EGender     }
        // e.g.{ colName:"age",                                                             }
        ];
    }
    static get _FieldsToInsert() { return this._FieldsToOnlyInsert.concat(this._FieldsToInsertAndUpdate) }

    static get _ReferencedFeedRecordsParams() {                                     //  Candidate for overriding !
        return [
            //  { ReferencedFeedItemRecord,  referencePropertyName, referenceIdPropertyName,                                               colNameJoiningToReferenced|colNameJoiningToReferencer, },
        ];
        //   These are transformed in .Setup() below into :
        //      { ReferencedFeedItemRecord,  referencePropertyName, referenceIdPropertyName, referenceIdLitObName=referenceIdPropertyName, colNameJoiningToReferenced, recNameJoiningTo, colNameJoinedInReferenced, colNameReferenceId, }
        //  e.g {     : PractitionerRecord, :'primaryPractitioner', :'primaryFeedPractitionerId', :'primaryFeedPractitionerId',            :'primary_practitioner_id', :'primary_practitioner_id',          : 'id',   : 'feed_item_id', }
    }
    get _ReferencedFeedRecordsParams() { throw Error(`${this.Name}.prototype.get _ReferencedFeedRecordsParams() : Not defined yet. Run ${this.Name}.Setup().`); }

    static get _UniOwnedFeedRecordsParams() {                                     //  Candidate for overriding !
        return [
            //  { UniOwnedFeedRecord, ownerPropertyName, ownerLitObName=ownerPropertyName, colNameJoiningToOwned|colNameJoiningToOwner,                                                    },
        ];
        //   These are transformed in .Setup() below into :
        //      { UniOwnedFeedRecord, ownerPropertyName, ownerLitObName=ownerPropertyName, colNameJoiningToOwned, recNameJoiningTo=colNameJoiningToOwned, colNameJoinedInOwned, },
        //
        //  e.g {    : ContactRecord,   : 'selfContact', :'selfContact',                     : 'self_contact_id',  : 'self_contact_id',                                 : 'id', },
    }
    get _UniOwnedFeedRecordsParams() { throw Error(`${this.Name}.prototype.get _UniOwnedFeedRecordsParams() : Not defined yet. Run ${this.Name}.Setup().`); }

    static get _MultiOwnedFeedRecordsParams() {                                   //  Candidate for overriding !
        return [
            //  { MultiOwnedFeedRecord, ownerArrayPropertyName, ownerLitObArrayName, colNameJoiningToOwner, colNameJoinedInOwner},
        ];
        //   These are transformed in .Setup() below into :
        //      { MultiOwnedFeedRecord, ownerArrayPropertyName, ownerLitObArrayName, colNameJoiningToOwner, colNameJoinedInOwner }
        //  e.g { :PractitionerLegitIdRecord,     : 'legitIds',       : 'practices',   : 'practitioner_id',               : 'id' }
    }                                                                             //  read from DB schema by default, FeedRecord.idDbName by default
    get _MultiOwnedFeedRecordsParams() { throw Error(`${this.Name}.prototype.get _MultiOwnedFeedRecordsParams() : Not defined yet. Run ${this.Name}.Setup().`); }

    //  This is enforced in Setup() with:
    //  thisProto.toOwnerApiLitOb = thisProto.toApiLitOb;   So BEWARE if it's changed!
    toOwnerApiLitOb() { return this.toApiLitOb();  }                                    //  Candidate for overriding !
    static FromOwnedApiLitOb(ownedApiLitOb) { throw Error(`${this.Name}.FromOwnedApiLitOb(ownedApiLitOb=${ownedApiLitOb}) : Not overriden yet !  Part of the Owned FeedRecord mandatory interface.`); }

    //region defined in .Setup()

    /**
     *
     * @returns {string}
     */
    get TableName() { throw Error(`${this.Name}.prototype.get TableName() : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {string}
     */
    static get idDbName() { throw Error(`${this.Name}.get idDbName() : Not defined yet. Run ${this.Name}.Setup().`); }
    /**
     *
     * @returns {string}
     */
    get idDbName() { throw Error(`${this.Name}.prototype.get idDbName() : Not defined yet. Run ${this.Name}.Setup().`); }

    static get uuidDbName() { return this.idDbName; }                                   //  Candidate for overriding !
    get uuidDbName() { return this.idDbName; }                                          //  Candidate for overriding !


    static get _ForeignKeyMapByTableName() { throw Error(`${this.Name}.get _ForeignKeyMapByTableName() : Not defined yet. Run ${this.Name}.Setup().`); }
    static get _UniqueForeignKeyMapByTableName() { throw Error(`${this.Name}.get _UniqueForeignKeyMapByTableName() : Not defined yet. Run ${this.Name}.Setup().`); }

    static _AssignStrByColName(colName) { throw Error(`${this.Name}._AssignStrByColName(colName=${colName}) : Not defined yet. Run ${this.Name}.Setup().`); }

    static get _ColumnsToInsert() { throw Error(`${this.Name}.get _ColumnsToInsert() : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @return {function({}, string[]):*[]}
     * @private
     */
    static get _GetValuesToInsert()  { throw Error(`${this.Name}.get _GetValuesToInsert() : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @param id
     * @param {*[]}insertedValues
     * @param {function}_fetchFromDb
     * @returns {Object}
     * @private
     */
    static _InsertedSrcObToRow(id, insertedValues, _fetchFromDb=fetchFromDb) { throw Error(`${this.Name}._InsertedSrcObToRow(id=${id}, insertedValues=${insertedValues}, _fetchFromDb=${_fetchFromDb}) : Not defined yet. Run ${this.Name}.Setup().`);}

    _setMostRecentKnownPersistedRowOwnUpdatableValues(rowPart) { throw Error(`${this.Name}._setMostRecentKnownPersistedRowOwnUpdatableValues(rowPart=${rowPart}) : Not defined yet. Run ${this.Name}.Setup().`); }
    _previousKnownPersistedRowUpdatableValue(colName) { throw Error(`${this.Name}._previousKnownPersistedRowUpdatableValue(colName=${colName}) : Not defined yet. Run ${this.Name}.Setup().`); }

    static get HasRowRetiredField() { throw Error(`${this.Name}.get HasRowRetiredField() : Not defined yet. Run ${this.Name}.Setup().`); }
    get HasRowRetiredField() { throw Error(`${this.Name}.prototype.get HasRowRetiredField() : Not defined yet. Run ${this.Name}.Setup().`); }

    static _ShaAndUuidSelectFcn(tblName, tblPrefix, shaAndUuidSelects) { throw Error(`${this.Name}._ShaAndUuidSelectFcn(tblName=${tblName}, tblPrefix=${tblPrefix}, shaAndUuidSelects=${shaAndUuidSelects}) : Not defined yet. Run ${this.Name}.Setup().`); }
    static _FixShaAndUuidOfRow(row) { throw Error(`${this.Name}._FixShaAndUuidOfRow(row=${row}) : Not defined yet. Run ${this.Name}.Setup().`); }
    static _ShaAndUuidNamesFnc(tblFullName) { throw Error(`${this.Name}._ShaAndUuidNamesFnc(tblFullName=${tblFullName}) : Not defined yet. Run ${this.Name}.Setup().`); }
    /**
     *
     * @returns {string[]}
     * @private
     */
    static get _ShaAndUuidNames() { throw Error(`${this.Name}.get _ShaAndUuidNames() : Not defined yet. Run ${this.Name}.Setup().`); }

    static _SqlSelectFcn(tblName, tblPrefix, sqlFroms) { throw Error(`${this.Name}._SqlSelectFcn(tblName=${tblName}, tblPrefix=${tblPrefix}, sqlFroms=${sqlFroms}) : Not defined yet. Run ${this.Name}.Setup().`); }
    static get _SqlSelect() { throw Error(`${this.Name}.get _SqlSelect() : Not defined yet. Run ${this.Name}.Setup().`); }

    static _SqlFromFcn(tblName, tblPrefix, sqlFroms) { throw Error(`${this.Name}._SqlFromFcn(tblName=${tblName}, tblPrefix=${tblPrefix}, sqlFroms=${sqlFroms}) : Not defined yet. Run ${this.Name}.Setup().`); }
    static get _SqlFrom() { throw Error(`${this.Name}.get _SqlFrom() : Not defined yet. Run ${this.Name}.Setup().`); }
    /**
     *
     * @param {{}} srcOb
     * @returns {{}|undefined}
     * @private
     */
    static _ExtractJoinedFromSrcOb(srcOb) { throw Error(`${this.Name}._ExtractJoinedFromSrcOb(srcOb=${srcOb}) : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @param tblPrefix
     * @param level
     * @param ownUniOwnedTblFullAndPropertyNames
     * @param demuxers
     * @returns {object[]}
     * @private
     */
    static _UniJoinedFetchDemuxerFcn(tblPrefix='', level=1, ownUniOwnedTblFullAndPropertyNames=[], demuxers=[]) { throw Error(`${this.Name}._UniJoinedFetchDemuxerFcn(tblPrefix=${tblPrefix}, level=${level}, ownUniOwnedTblFullAndPropertyNames=${ownUniOwnedTblFullAndPropertyNames}, demuxers=${demuxers}) : Not defined yet. Run ${this.Name}.Setup().`); }
    /**
     *
     * @param {string} sql
     * @param {*[]}criteriaList
     * @param {function} _fetchFromDb
     * @param {function(FeedRecord):FeedRecord} mapRecord
     * @returns {Promise<FeedRecord[]>}
     * @private
     */
    static async _FetchAndBuild(sql, criteriaList, _fetchFromDb, mapRecord=r=>r) { throw Error(`${this.Name}._FetchAndBuild(sql=${sql}, criteriaList=${criteriaList}, _fetchFromDb=${_fetchFromDb}, mapRecord=${mapRecord}) : Not defined yet. Run ${this.Name}.Setup().`); }

    static _BuildFeedRecordFromOriginalSrcObToUpdate(originalSrcOb, initialRow={}) { throw Error(`${this.Name}._BuildFeedRecordFromOriginalSrcObToUpdate(originalSrcOb=${originalSrcOb}, initialRow=${initialRow}) : Not defined yet. Run ${this.Name}.Setup().`); }
    _applyUpdateCandidate(candidateSrcOb) { throw Error(`${this.Name}.prototype._applyUpdateCandidate(candidateSrcOb=${candidateSrcOb}) : Not defined yet. Run ${this.Name}.Setup().`);}

    //endregion

    static Setup() {
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
        const thisProto = This.prototype;

        const tableName = This.TableName;
        Object.defineProperty(This,      'TableName', {value:tableName});
        Object.defineProperty(thisProto, 'TableName', {value:tableName});

        thisProto._FetchById = This._FetchById;
        thisProto._GetCurrentRowPersistedAndVersion = This._GetCurrentRowPersistedAndVersion;

        //region TableSchema, schemaFieldMap, validateWithSchema

        const { TableSchema } =
            Object.defineProperty(This,      'TableSchema', {value:tableSchema[tableName]});
            Object.defineProperty(thisProto, 'TableSchema', {value:TableSchema});

        if (undefined === TableSchema) {
            throw Error(`No Schema found in DB [${databaseName}] for ${This.Name} .TableName [${tableName}].`);
        }
        //  TableSchema is a string holding the schema obtained from `SHOW CREATE TABLE ${tableName}`.
        //      The .fields, .primaryKey, .foreignKeys and .fieldMap properties are attached to that string.

        try {
            TableSchema.fields = parseTableSchema(TableSchema);
        }
        catch (e) {
            e.message = `Parsing DB [${databaseName}] table [${tableName}] schema : ` + e.message;
            throw e;
        }
        const schemaFieldMap = TableSchema.fields.reduce(                   //  map.set() returns map !
                                                         (map, schemaField) =>
                                                                                map.set(schemaField.name, schemaField),
                                        /* initial empty  map:*/ new Map() );


        const {  foreignKeys,   primaryKey, uniqueKeys, uniqueKeySet  } = TableSchema.fields;
        if ('string' !== typeof primaryKey) { //  Maybe undefined or an array if the primaryKey is a multi-column index.
            throw Error(`No single-column primary key found in DB [${databaseName}] for ${This.Name} .TableName [${tableName}].`);
        }

        Object.defineProperty(This,      'idDbName', {value:primaryKey});
        Object.defineProperty(thisProto, 'idDbName', {value:primaryKey});

        Object.assign(TableSchema, { primaryKey, uniqueKeys, uniqueKeySet, foreignKeys, fieldMap:schemaFieldMap });


        const {_ForeignKeyMapByTableName} = Object.defineProperty(This,'_ForeignKeyMapByTableName', {value:{}});
        const {_UniqueForeignKeyMapByTableName} = Object.defineProperty(This,'_UniqueForeignKeyMapByTableName', {value:{}});

        //  e.g. ['patient_id', {      `Patient`,               'id'       }] of PatientLegitIdRecord
        for (let [  colName,    {fkReferencedTableName, fkReferencedColName, isUniqueKey}] of schemaFieldMap) {
            if (fkReferencedTableName) {  //  fkReferenced* are undefined unless a field is a single-column-foreign-key
                const map = _ForeignKeyMapByTableName[fkReferencedTableName]  ||  new Map();
                if ( ! map.size ) {     //  assign empty new Map()
                    _ForeignKeyMapByTableName[fkReferencedTableName] = map;
                }
                map.set(colName, fkReferencedColName);
                //  e.g. PatientRecord._ForeignKeyMapByTableName[`Contact`].get('self_contact_id') === 'id';

                if (isUniqueKey) {
                    const uniqueMap = _UniqueForeignKeyMapByTableName[fkReferencedTableName]  ||  new Map();
                    if ( ! uniqueMap.size ) {     //  assign empty new Map()
                        _UniqueForeignKeyMapByTableName[fkReferencedTableName] = map;
                    }
                    uniqueMap.set(colName, fkReferencedColName);
                }
                //  e.g. PatientReachabilityRecord._ForeignKeyMapByTableName[`Patient`].get('patient_id') === 'id';
            }
        }

        const validateWithSchema = (colName, recEnum) => {
            const schemaField = schemaFieldMap.get(colName);
            if (undefined === schemaField) {
                throw Error(`${This.Name} colName [${colName}] not found in DB [${databaseName}] table [${tableName}].`)
            }
            const { sqlType, eType, typeParam, } = schemaField;

            //  Validate recEnum with DB enum or set
            if (eEnumDbJsType === eType) {
                if (null === recEnum) {
                    throw EnumError(`No .recEnum specified for ${This.Name} .colName [${colName}] while DB [${
                                databaseName}] table [${tableName}] defines column [${colName}] as a ${sqlType}(${typeParam}).`)
                }
                const dbEnumSet = new Set(typeParam);
                const errList = [];
                for (let {name:eItemName} of recEnum) {     //  match enum item names from recEnum with those in DB enum
                    if (dbEnumSet.has(eItemName)) {
                        dbEnumSet.delete(eItemName);        //  remove the eItemName found
                    }
                    else {                                  //  add error message if not found
                        errList.push(`The .recEnum [${recEnum._name}] for ${This.Name} .colName [${colName
                                        }] has an enum item named [${eItemName}] that is not part of DB [${databaseName
                                        }] table [${tableName}] column [${colName}] ${sqlType}(${typeParam}).`);
                    }
                }
                for (let name of dbEnumSet) {           //  add error messages for the non-removed item names of DB enum
                    errList.push(`DB [${databaseName}] table [${tableName}] ${sqlType} for column [${colName
                                }] has an enum item named [${name}] that is not part of the ${This.Name} .recEnum ${
                                recEnum._name} definition associated to that .colName : {${recEnum.join(',')}}.`);
                }
                if (errList.length) {
                    throw EnumError(errList.join('\n'), recEnum);
                }
            }
            else if (null !== recEnum) {
                throw EnumError(`The .recEnum [${recEnum._name}] has been defined for ${This.Name} .colName [${colName
                    }] while that column name in DB [${databaseName}] table [${tableName}] is not an enum or set.`, recEnum);
            }

            return schemaField;
        };

        //endregion

        //region hasRowRetiredField, .row_retired, .rowRetired, .retire() .Retire(), toOwnLitOb(), toApiLitOb()

        const hasRowRetiredField = schemaFieldMap.get('row_retired');

        Object.defineProperty(This,      'HasRowRetiredField', {value: hasRowRetiredField });
        Object.defineProperty(thisProto, 'HasRowRetiredField', {value: hasRowRetiredField });

        Object.defineProperty(This,      '_sqlNotRetired', {value: hasRowRetiredField ? This._sqlNotRetired : ''});
        Object.defineProperty(thisProto, '_sqlNotRetired', {value: hasRowRetiredField ? This._sqlNotRetired : ''});

        if ( ! hasRowRetiredField) {                            //  Override both .row_retired and .rowRetired getters.
            Object.defineProperty(thisProto, 'row_retired', {value: undefined });
            Object.defineProperty(thisProto, 'rowRetired',  {value: undefined });
            Object.defineProperty(This,      'Retire', {value: async function() {
                    throw Error(`${This.Name}.Retire() not implemented : DB ${databaseName} table ${tableName} has no row_retired column.`);
                } });
            Object.defineProperty(thisProto, 'retire', {value: async function() {
                    throw Error(`${This.Name}.prototype.retire() not implemented, DB ${databaseName} table ${tableName} has no row_retired column.`);
                } });

            const FeedRecordProto = FeedRecord.prototype;

            //  NOTE :  it's the base class proto .toOwnLitOb() that is overridden, not This's.
           FeedRecordProto.toOwnLitOb = function toOwnLitOb(){
                    const  { id, rowVersion, rowCreated, rowPersisted, } = this;
                    return { id, rowVersion, rowCreated, rowPersisted, };
            };
        }

        //endregion

        //  The FeedRecord UPDATE mechanism uses a shadow copy object which holds the changed values of the
        //  properties/fields that can be updated (as per a FeedRecord definition).
        //
        //  That shadow copy is stored in this.#toUpdate, and is emptied each time a FeedRecord is persisted
        //  either with static Insert() or with feedRecord.update().
        //
        //  Getter/setter with .recName are used to fill the   this.#toUpdate   shadow copy and to return the most
        //  recent of the changed or last known persisted value of a field.
        //
        //  e.g. a field { colName:'last_name', recName:'lastName', ...  }
        //
        //       in the constructor, we set the last known persisted row data received in argument via either:
        //          this.last_name = last_name;
        //       or
        //          Object.assign(this, {last_name, ...})
        //
        //       It is later manipulated using the FeedRecord setter for last_name/lastName:
        //          set lastName(value) { this.#toUpdate['last_name'] = value; },
        //
        //       So there will be two version of that last_name/lastName field in FeedRecord:
        //          this.last_name                  //  holding the value from the last known persisted row
        //       and
        //          this.#toUpdate['last_name']     //  holding the changed value to be used in the next UPDATE.
        //
        //       With these, a .lastName getter can be defined for .last_name that returns the most recent of the
        //       changed or last know persisted value, as follows :
        //
        //                 //  defaults to   this['last_name']   if   this.#toUpdate['last_name']   is undefined.
        //
        //          get lastName() { ((value=this['last_name']) => value)(this.#toUpdate['last_name']); },
        //
        //
        //  If the field colName and recName is the same,
        //
        //  e.g. a field { colName:'age',    recName:'age'  }
        //
        //       the 'age' property can't be both a value property and a getter/setter property. So there's
        //       no way to store the last known persisted row value apart from a potential changed value.
        //       Indeed when the setter is defined:
        //          set age(value) {   this.#toUpdate['age'] = value; },
        //
        //       then when the FeedRecord constructor(), performs either :
        //          Object.assign(this, { age })
        //       or
        //          this.age = age
        //
        //       it will call the setter and :
        //          this.#toUpdate['age'] = ..  will thus be called in the constructor, whereas the value property :
        //          this.[age]                  will never be set.
        //
        //  In order to solve this issue, a   ._colName   property is added to the fields defined to
        //  be updated. That _colName is colName prefixed with '_' if .colName and .recName are equal.
        //
        //  e.g. fields  { colName:'age',       recName:'age',      ...  _colName:'_age' }   vs
        //               { colName:'last_name', recName:'lastName', ...  _colName:'last_name'}
        //
        //  That _colName is used uniquely :
        //      - in the getter, to fallback on that last know persisted row value if there's none in this.#toUpdate.
        //      - in the constructor() to unambiguously set the last known persisted row value of a field;
        //
        //  A private method is generated by .Setup() here to perform the later :
        //
        //      this._setMostRecentKnownPersistedRowOwnUpdatableValues(rowPart)
        //
        //  Note that we don't prefix ALL the colName with '_', only those for which colName and recName are
        //  equal, like 'age'.  With fields like last_name/lastName, access to the expected colName property :
        //
        //      .last_name
        //
        //  would be prevented by adding a prefix unless we also add a 'last_name' getter, This is not the
        //  case when colName and recName are equal: the recName getter property is just the colName's too.
        //

        const eErrMaxLen = 80;
        const enumErr = recEnum => `${recEnum._name}: {${(s => s.length > eErrMaxLen ? s.slice(0, eErrMaxLen)+' ...' : s)
                                                         (recEnum.join('|'))}}`;
        const recVsCol = ({colName, _colName, recName, recEnum, canBeNull, eType, typeParam}) => {
            let validateNMorphToCol = recValue => recValue;      // straight thru
            let morphToRec          = canBeNull  ?  colValue =>  null === colValue  ?  undefined  :  colValue
                                                 :  colValue => colValue;      // straight thru
            const errMsgPrefix = `${tableName} .${recName} [`;
            const errNotNullMsgSuffix = `] invalid: it can't be null or undefined.`;

            if (recEnum) {

                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''}one of ${enumErr(recEnum)}`;

                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                                            if (undefined === recValue  ||  null === recValue) {
                                                return null;
                                            }
                                            const eRecValue = recEnum[recValue];
                                            if (undefined === eRecValue) {
                                                throw EnumError(errMsgPrefix + recValue + errMsgSuffix, recEnum);
                                            }
                                            return eRecValue.name;    //  === `${eRecValue}`;
                                        };
                    morphToRec = colValue => recEnum[colValue];                 //  undefined if null === colValue
                }
                else {                                                                              //  cannotBeNull
                    validateNMorphToCol = recValue => {
                                            //  neither null nor undefined are ever an EItem of an Enum.
                                            const eRecValue = recEnum[recValue];
                                            if (undefined === eRecValue) {
                                                throw EnumError(errMsgPrefix + recValue + errMsgSuffix, recEnum);
                                            }
                                            return eRecValue.name;    //  === `${eRecValue}`;
                                        };
                    morphToRec = colValue => recEnum[colValue];
                }
            }
            else if (eStringDbJsType === eType) {
                                    //  the string is not capped ?
                const morphString =  undefined === typeParam  ?  recValue => recValue
                                                              :  recValue =>               //  typeParam === maxLen
                                                                             recValue.slice(0, typeParam);
                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''}of js type "string".`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                                            if ('string' === typeof recValue) {
                                                return morphString(recValue);
                                            }
                                            if (undefined === recValue || null === recValue) {
                                                return null;
                                            }
                                            else {
                                                throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                            }
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
                else {                                  //  cannotBeNull
                    validateNMorphToCol = recValue => {
                                            if ('string' === typeof recValue) {
                                                return morphString(recValue);
                                            }
                                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
            }
            else if (eNumberDbJsType === eType) {
                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''}of js type "number".`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                                            if ('number' === typeof recValue) {
                                                return recValue;
                                            }
                                            if (undefined === recValue || null === recValue) {
                                                return null;
                                            }
                                            else {
                                                throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                            }
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
                else {                                  //  cannotBeNull
                    validateNMorphToCol = recValue => {
                                            if ('number' === typeof recValue) {
                                                return recValue;
                                            }
                                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
            }
            else if (eBooleanDbJsType === eType) {
                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''}of js type "boolean".`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                                            if ('boolean' === typeof recValue) {
                                                return recValue;
                                            }
                                            if (undefined === recValue || null === recValue) {
                                                return null;
                                            }
                                            else {
                                                throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                            }
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
                else {                                  //  cannotBeNull
                    validateNMorphToCol = recValue => {
                                            if ('boolean' === typeof recValue) {
                                                return recValue;
                                            }
                                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
            }
            else if (eDateDbJsType === eType) {
                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''}of js type "Date".`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                                            if (undefined === recValue || null === recValue) {
                                                return null;
                                            }
                                            //  If strToDate() argument is a string, return the Date from it if
                                            //  it is valid, else return argument (including already a Date).
                                            recValue = strToDate(recValue);
                                            if (recValue instanceof Date) {
                                                return recValue;
                                            }
                                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
                else {                                  //  cannotBeNull
                    validateNMorphToCol = recValue => {
                                            //  If strToDate() argument is a string, return the Date from it if
                                            //  it is valid, else return argument (including already a Date).
                                            recValue = strToDate(recValue);
                                            if (recValue instanceof Date) {
                                                return recValue;
                                            }
                                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                                        };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
            }
            else if (eUuidDbJsType === eType) {
                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''} a uuid string.`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                        if ('string' === typeof recValue  &&  recValue.match(/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i)) {
                            return recValue;
                        }
                        if (undefined === recValue || null === recValue) {
                            return null;
                        }
                        else {
                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                        }
                    };
                    //  morphToRec          //  keep the default straight thru definition. The DB does the conversion.
                }
                else {                                  //  cannotBeNull
                    validateNMorphToCol = recValue => {
                        if (undefined === recValue) {   //  Only undefined, null throws.
                            return uuidv1();
                        }
                        if ('string' !== typeof recValue  ||  ! recValue.match(/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i)) {
                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                        }
                        return recValue;
                    };
                    //  morphToRec          //  keep the default straight thru definition. The DB does the conversion.
                }
            }
            else if (eShaDbJsType === eType) {
                const errMsgSuffix = `] invalid : must be ${canBeNull ? 'null or ' : ''} a sha256 string.`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {
                        if ('string' === typeof recValue  &&  recValue.match(/^[0-9a-f]{64}$/i)) {
                            return recValue;
                        }
                        if (undefined === recValue || null === recValue) {
                            return null;
                        }
                        else {
                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                        }
                    };
                    //  morphToRec          //  keep the default straight thru definition. The DB does the conversion.
                }
                else {                                  //  cannotBeNull
                    validateNMorphToCol = recValue => {
                        if ('string' !== typeof recValue  ||  ! recValue.match(/^[0-9a-f]{64}$/i)) {
                            throw WrongType(errMsgPrefix + recValue + errMsgSuffix);
                        }
                        return recValue;
                    };
                    //  morphToRec          //  keep the default straight thru definition. The DB does the conversion.
                }
            }
            else {                                                      //  ideally would never get here.
                const errMsgSuffix = `] using "default" validateNMorphToCol() for colName [${colName}] of eType [${eType}].`;
                if (canBeNull) {
                    validateNMorphToCol = recValue => {                                    //  maybe null
                                        logger.warn(errMsgPrefix + recValue + errMsgSuffix);
                                        return (undefined === recValue) ? null : recValue;
                                    }
                //  morphToRec                                          //  keep the default straight thru definition.
                }
                else {                              //  not a recEnum nor canBeNull
                    validateNMorphToCol = recValue => {
                                        logger.warn(errMsgPrefix + recValue + errMsgSuffix);
                                        if (undefined === recValue  ||  null === recValue) {
                                            throw CantBeNull(errMsgPrefix + recValue + errNotNullMsgSuffix);
                                        }
                                        return recValue;
                                    };
                //  morphToRec                                          //  keep the default straight thru definition.
                }
            }

            return {
                recToCol : srcOb =>
                                    validateNMorphToCol(srcOb[recName]),
                set : function(value) { // noinspection JSPotentiallyInvalidUsageOfClassThis
                                        this.#toUpdate[colName] = validateNMorphToCol(value); },
                get : function() { // noinspection JSPotentiallyInvalidUsageOfClassThis
                                   return (
                                             ( value=this[_colName] )   =>
                                                                            morphToRec(value)
                                          )( this.#toUpdate[colName] ); }
            };
        };

        const toFullField = ({ colName, recName=colName, recEnum=null }, onlyInsert=false) => {
            const { canBeNull, eType, typeParam, } = validateWithSchema(colName, recEnum);

            //  see the reason to add _colName in the FeedRecord UPDATE mechanism description above.
            const _colName = onlyInsert ? colName
                                        : colName===recName ? '_'+colName : colName;
            return {
                colName, _colName, recName, recEnum, canBeNull, eType, typeParam,
                ...recVsCol({colName, _colName, recName, recEnum, canBeNull, eType, typeParam}), // => {recToCol(), set(), get()}
            }
        };
        const toFullOnlyInsertField = (colName_recName_recEnum) => toFullField(colName_recName_recEnum, true);

        const feedRecordBaseUpdating = [
            { colName: 'id',                                    },
            { colName: 'row_version',   recName:'rowVersion'    },
            { colName: 'row_persisted', recName:'rowPersisted'  },
        ].map( toFullOnlyInsertField );                     //  Hardcoded FeedRecord base fields relevant for updates

        const mapFields = fields => fields.reduce(              //  map.set() returns map !
                                                  (map, field)  =>
                                                                    map.set(field.colName, field),
                                /* initial empty   map:*/ new Map() );
        const allInsertableOnly  = This._FieldsToOnlyInsert.map( toFullOnlyInsertField );
        allInsertableOnly._map = mapFields(allInsertableOnly);
        Object.defineProperty(This, '_FieldsToOnlyInsert', {value:allInsertableOnly});

        const allUpdatInsertable = This._FieldsToInsertAndUpdate.map( toFullField );
        allUpdatInsertable._map = mapFields(allUpdatInsertable);
        Object.defineProperty(This, '_FieldsToInsertAndUpdate', {value:allUpdatInsertable});

        const allInsertable = allInsertableOnly.concat(allUpdatInsertable);
        allInsertable._map = mapFields(allInsertable);
        Object.defineProperty(This, '_FieldsToInsert', {value:allInsertable});

        const uniJoinedValidateAndComplete = (uniJoinedFeedRecordParams, { _UniJoinedFeedRecordsParamsParam,
                    colNameJoinedInDownParam, colNameJoinedInUpParam,colNameJoiningToDownParam, colNameJoiningToUpParam,
                    UniJoinedRecordParam, propertyNameParam, litObNameParam,    referencePropertyNameParam=''}) => {

            //  Up and Down in the owning/referencing hierarchy
                                                            //  'UniOwnedFeedRecord'  ||  'ReferencedFeedItemRecord'
            let Record              =  uniJoinedFeedRecordParams[UniJoinedRecordParam],
                propertyName        =  uniJoinedFeedRecordParams[propertyNameParam],
                litObName           =  uniJoinedFeedRecordParams[litObNameParam],               //  may be undefined
            //  colNameJoiningToDown :  colNameJoiningToOwned || colNameJoiningToReferenced;
                colNameJoiningToDown=  uniJoinedFeedRecordParams[colNameJoiningToDownParam],    //  may be undefined

            //  colNameJoiningToUp   :  colNameJoiningToOwner || colNameJoiningToReferencer;
                colNameJoiningToUp  =  uniJoinedFeedRecordParams[colNameJoiningToUpParam],      //  may be undefined

            //  HACK
            //       '' === referencePropertyNameParam  ?  ReferenceFeedItemRecord
            //                                          :  UniOwnedFeedRecord

            refPropertyName =  referencePropertyNameParam ? uniJoinedFeedRecordParams[referencePropertyNameParam] : '',
                    isOwned = !referencePropertyNameParam;  //  vs is Referenced

            //  Either .colNameJoiningToDown (i.e. ToOwned, ToReferenced)   is defined
            //      OR .colNameJoiningToUp   (i.e. ToReferenced, ToReferencer), but not both !
            const uniJoinedParams = () => `${This.Name}.${_UniJoinedFeedRecordsParamsParam} entry : { ${
                                            UniJoinedRecordParam}: ${Record ? Record.Name : JSON.stringify(Record)
                                            }${  referencePropertyNameParam                                        ?  
                                            `, ${referencePropertyNameParam}: ${JSON.stringify(refPropertyName)}`  :  ''
                                            }, ${propertyNameParam}: ${JSON.stringify(propertyName)
                                            }${undefined === litObName ? '' :
                                            `, ${litObNameParam}: ${JSON.stringify(litObName)}`
                                            }${undefined === colNameJoiningToDown ? '' :
                                                `, ${colNameJoiningToDownParam}: ${JSON.stringify(colNameJoiningToDown)}`
                                            }${undefined === colNameJoiningToUp ? '' :
                                                `, ${colNameJoiningToUpParam}: ${JSON.stringify(colNameJoiningToUp)}`
                                            }, ... }`;

            const missing = [];                                 //  'UniOwnedFeedRecord'  ||  'ReferencedFeedItemRecord'
            if (undefined === Record){          missing.push(`property .${UniJoinedRecordParam}`); }
            if (undefined === refPropertyName  &&  referencePropertyNameParam) {
                                                missing.push(`property .${referencePropertyNameParam}`); }
            if (undefined === propertyName) {   missing.push(`property .${propertyNameParam}`); }

            const missingStr = missing.join(' and ');
            if (missingStr) {
                throw Error(missingStr + ` MUST be defined in ${uniJoinedParams()}.`);
            }

            const { Name, TableName, idDbName } = Record;

            if (referencePropertyNameParam  &&  ! FeedRecordCanBeReferenced(Record) ) {
                throw Error(`In ${uniJoinedParams()},\n.${UniJoinedRecordParam} [${Name}] MUST either be a ${
                    FeedItemRecord.Name}, or use feedCore/lib/dao ReferencedFeedRecordSetup() as .Setup() property.`);
            }

            if (colNameJoiningToDown  &&  colNameJoiningToUp) {
                throw Error(`either .${colNameJoiningToDownParam} OR .${colNameJoiningToUpParam} property `+
                       `can be defined, but not BOTH, in ${uniJoinedParams()}.`);
            }

            //  First, this DB schema must include :
            //      either a {owner|referencer} foreign key pointing to {UniOwned|Referenced}FeedRecord,
            //          or a UNIQUE {UniOwned|Referenced}FeedRecord foreign key pointing to {owner|referencer}.

            //  e.g.  in a ContactRecord ._UniOwnedFeedRecordsParams entry with .UniOwnedFeedRecord = AddressRecord
            //          : ContactRecord._ForeignKeyMapByTableName['Address']        OR
            //          : AddressRecord._UniqueForeignKeyMapByTableName['Contact']
            const upForeignKeyMap = _ForeignKeyMapByTableName[TableName],
                  downUniqueForeignKeyMap = Record._UniqueForeignKeyMapByTableName[tableName];

            if (undefined === upForeignKeyMap  &&  undefined === downUniqueForeignKeyMap) {
                throw Error(`In DB \`${databaseName}\`,\n    neither table \`${tableName}\` schema for ${This.Name
                            } has a single-column-foreign-key defined which REFERENCEs ${Name
                            }'s table \`${TableName}\`,\n    nor table \`${TableName}\` schema for ${Name
                            }, has a UNIQUE single-column-foreign-key defined which REFERENCEs ${This.Name
                            }'s table \`${tableName}\` :\nFix the ${uniJoinedParams()
                            } that requires such a foreign key in DB schema${
                                ((downForeignKeyMap) => //  Not only UNIQUE, all down {Owned|Referenced} foreignKey map
                                        (downForeignKeyMap && downForeignKeyMap.get(colNameJoiningToUp))    ?
                                        `, or add UNIQUE attribute to table \`${TableName}\` column \`${
                                                                               colNameJoiningToUp}\` KEY.`  :  '.'
                                )(Record._ForeignKeyMapByTableName[tableName])}`);  // JoiningToUp: To{Owner|Referencer}
            }

            //  A set of single-column-foreign-key was found in the DB schema for the mutual table name
            //  in either of either This, or This._UniJoinedFeedRecordsParams.Record. (UniOwned|Referenced}

            //  Then, either both .colNameJoiningTo{Owned|Referenced} AND .colNameJoiningTo{Owner|Referencer}
            //                                          is undefined and we try to pick it from DB schema foreign key
            //            or      .colNameJoiningTo{Owned|Referenced}  OR .colNameJoiningTo{Owner|Referencer}
            //                                          is defined and we validate it.

            let colNameJoinedInDown,// Owned|Referenced
                colNameJoinedInUp;  // Owner|Referencer

                                        //    Owned|Referenced                        Owner|Referencer
            if (undefined === colNameJoiningToDown  &&  undefined === colNameJoiningToUp) { //  Try get it from DB schema foreign key
                if (upForeignKeyMap  &&  downUniqueForeignKeyMap) {
                    throw Error(`In DB \`${databaseName}\`,\n    both table \`${tableName}\` schema for ${This.Name
                                } has at least one single-column-foreign-key defined which REFERENCEs ${Name
                                }'s table \`${TableName}\`,\n    and table \`${TableName}\` schema for ${Name
                                } has at least one UNIQUE single-column-foreign-key defined which REFERENCEs ${
                                    This.Name}'s table \`${tableName}\` :\nFix the ${uniJoinedParams()
                                }] by defining either a .${colNameJoiningToDownParam} or a .${colNameJoiningToUpParam
                                } property to pick one of these foreign keys.`);

                }
                if (upForeignKeyMap) {
                    if (upForeignKeyMap.size > 1) {
                        throw Error(`DB \`${databaseName}\` table \`${tableName}\` schema for ${This.Name
                            }, defines many single-column-foreign-keys (i.e. ${     //  .keys() === fkColNames
                            Array.from(upForeignKeyMap.keys()).map(colName => '`'+colName+'`').join(', ')
                            }) that REFERENCE ${Name}'s table \`${TableName}\` :\nFix the ${uniJoinedParams()
                            } by adding a .${colNameJoiningToDownParam} property to pick one of these foreign keys.`);
                    }
                // e.g.  [ 'self_contact_id', 'id' ]                                        //  Just the one entry
                    ( [ colNameJoiningToDown, colNameJoinedInDown ] = upForeignKeyMap.entries().next().value);
                }
                if (downUniqueForeignKeyMap) {
                    if (downUniqueForeignKeyMap.size > 1) {
                        throw Error(`DB \`${databaseName}\` table \`${TableName}\` schema for ${Name
                            }, defines many UNIQUE single-column-foreign-keys (i.e. ${  //  .keys() === fkColNames
                                Array.from(downUniqueForeignKeyMap.keys()).map(colName =>'`'+colName+'`').join(', ')
                            }) that REFERENCEs back ${This.Name}'s table \`${tableName}\` :\nFix the ${uniJoinedParams()
                            } by adding a .${colNameJoiningToUpParam} property to pick one of these foreign keys.`);
                    }
                // e.g. ['self_contact_id', 'id']                                           //  Just the one entry
                    ( [ colNameJoiningToUp, colNameJoinedInUp ] = downUniqueForeignKeyMap.entries().next().value);
                }
            }
            else {                              //  Validate .colNameJoiningTo{{Owned|Referenced} | {Owner|Referencer}}

                const unless = (used, intended) => `(Unless .${used} was intended to be .${intended} instead ?)`;

                //  e.g.  in a ContactRecord ._UniOwnedFeedRecordsParams entry with .UniOwnedFeedRecord = AddressRecord
                //          : ContactRecord._ForeignKeyMapByTableName['Address'].get('address_id')          OR
                //          : AddressRecord._UniqueForeignKeyMapByTableName['Contact'].get('contact_id')

                //  at this point, either colNameJoiningToDown OR colNameJoiningToUp is defined but not BOTH.
                if (colNameJoiningToDown) {         //  To{Owned|Referenced} OR To{Owner|Referencer}

                    if (undefined === upForeignKeyMap) {
                        throw Error(`DB \`${databaseName}\` table \`${tableName}\` schema for ${This.Name
                                    } has no single-column-foreign-key defined which REFERENCEs ${Name
                                    }'s table \`${TableName}\` :\nFix the ${uniJoinedParams()
                                    } that requires such a foreign key in DB schema.\n${
                                    unless(colNameJoiningToDownParam, colNameJoiningToUpParam)}`);
                    }                                                          //  To{Owned|Referenced}
                           colNameJoinedInDown = upForeignKeyMap.get(colNameJoiningToDown);             //  e.g.  'id'
                    if ( ! colNameJoinedInDown ) {      // .colNameJoiningToDown is not a foreign key in This DB schema
                        const [ down, upToDown ] = isOwned ?
                              ['owned', 'owner to owned']  :  ['referenced', 'referencer to referenced'];
                        throw Error(
                            `${uniJoinedParams()}, joined from ${upToDown},\nis thus based on DB \`${databaseName
                            }\` table \`${tableName}\` schema for ${This.Name}, which includes single-column-foreign-key${
                            upForeignKeyMap.size > 1         //    .keys === fkColNames       
                                ? `s (${ Array.from(upForeignKeyMap.keys()).map(colName =>'`'+colName+'`').join(', ')
                                    }), which REFERENCE that ${down} ${Name} table \`${TableName}\`.\nProperty .${
                                    colNameJoiningToDownParam} MUST match one of these foreign key names`
                                                    // .keys()[0] === fkColName
                                : ` \`${upForeignKeyMap.keys().next().value
                                    }\`, which REFERENCEs that ${down} ${Name} table \`${TableName}\`.\nProperty .${
                                    colNameJoiningToDownParam} MUST match this foreign key name or be undefined`
                            }. ${unless(colNameJoiningToDownParam, colNameJoiningToUpParam)}`);
                    }
                }
                //  if (colNameJoiningToUp) {   //
                else {                                                                //  {Owner|Referencer}
                    if (undefined === downUniqueForeignKeyMap) {
                        throw Error(`DB \`${databaseName}\` table \`${TableName}\` schema for ${Name
                            }, has no UNIQUE single-column-foreign-key defined which REFERENCEs ${This.Name
                            }'s table \`${tableName}\` :\nFix the ${uniJoinedParams()
                            } that requires such a foreign key in DB schema${
                                ((downForeignKeyMap) => //  Not only UNIQUE, all down {Owned|Referenced} foreignKey map
                                        (downForeignKeyMap && downForeignKeyMap.get(colNameJoiningToUp))    ?
                                        `, or add UNIQUE attribute to table \`${TableName}\` column \`${
                                                                               colNameJoiningToUp}\` KEY.`  :  '.'
                                )(Record._ForeignKeyMapByTableName[tableName])    // JoiningToUp: To{Owner|Referencer}
                            }.\n${unless(colNameJoiningToUpParam, colNameJoiningToDownParam)}`);

                    }
                           colNameJoinedInUp =  downUniqueForeignKeyMap.get(colNameJoiningToUp);        //  e.g.  'id'
                    if ( ! colNameJoinedInUp ) {
                        const [ up, downToUp ] = isOwned ?
                          ['owner', 'owned to owner']    :    ['referencer', 'referenced to referencer'];
                        throw Error(                    // .colNameJoiningToOwner is not a foreign key in DB schema
                            `${uniJoinedParams()}, joined from ${downToUp},\nis thus based on DB \`${databaseName
                            }\` table \`${TableName}\` schema for ${Name}, which includes UNIQUE single-column-foreign-key${
                            downUniqueForeignKeyMap.size > 1           //  .keys === fkColNames       
                                ? `s (${ Array.from(downUniqueForeignKeyMap.keys()).map(colName =>'`'+colName+'`').join(', ')
                                    }), which REFERENCEs back that ${up} ${This.Name} table \`${tableName
                                    }\`.\nProperty .colNameJoiningToOwner MUST match one of these foreign key names`
                                                                // .keys()[0] === fkColName
                                : ` \`${downUniqueForeignKeyMap.keys().next().value}\`, which REFERENCEs back that ${up
                                    } ${This.Name} table \`${tableName}\`.\nProperty .${colNameJoiningToUpParam
                                    } MUST match this foreign key name or be undefined`
                            }. ${unless(colNameJoiningToUpParam, colNameJoiningToDownParam)}`);
                    }
                }
            }

            const getFromRecordFieldToInsert = (Record, colName, unique='') => {
                const fieldToInsert = Record._FieldsToInsert._map.get(colName);
                if ( !fieldToInsert ) {
                    const {canBeNull} = Record.TableSchema.fieldMap.get(colName) || {};
                    throw Error(`${uniJoinedParams()} is based on DB \`${databaseName}\` table \`${TableName
                                }\` schema's ${unique}single-column-foreign-key \`${colName
                                }\`.\nNo entry with { colName:'${colName}', ... }  can be found in either ${
                                    Name} ._FieldsToOnlyInsert${false !== canBeNull  ?  ''  :   //  true or undefined
                                                              ' (where it should according to NOT NULL schema)'
                                } or ._FieldsToInsertAndUpdate.  Fix it !`);
                }
                return fieldToInsert;
            };

            //  At this point, either colNameJoiningToDown OR colNameJoiningToUp is valid.
            //                                      To{Owned|Referenced} OR To{Owner|Referencer}

            //  Either colNameJoinedInDown or colNameJoinedInUp was read from upForeignKeyMap|downUniqueForeignKeyMap,
            //  We now can validate it !
            if (colNameJoiningToDown) {                                                         //  {Owned|Referenced}
                if (colNameJoinedInDown !== idDbName) {
                    throw Error(`${uniJoinedParams()} is based on DB \`${databaseName}\` table \`${tableName
                        }\` schema's single-column-foreign-key \`${colNameJoiningToDown
                        }\`, that REFERENCEs column \`${colNameJoinedInDown}\` of ${UniJoinedRecordParam} table \`${
                        TableName}\`.\nThat colum name MUST match that of ${Name} .idDbName [${idDbName}]`);
                }

                const { canBeNull, recName, } = getFromRecordFieldToInsert(This, colNameJoiningToDown);

                return Object.assign(uniJoinedFeedRecordParams, {
                    [litObNameParam]:               undefined===litObName  ?  propertyName  :  litObName,
                    [colNameJoiningToDownParam]:    colNameJoiningToDown,   //  May override undefined
                    [colNameJoinedInDownParam]:     colNameJoinedInDown,
                    recNameJoiningTo:               recName,
                    joiningColNameCanBeNull:        canBeNull,
                    joiningDown:                    true,
                });
            }
            //  if (colNameJoiningToUp) {                                                       //  {Owner|Referencer}
            else {
                //  e.g.  in a ContactRecord ._UniOwnedFeedRecordsParams entry with .UniOwnedFeedRecord = AddressRecord
                //          : AddressRecord._UniqueForeignKeyMapByTableName['Contact'].get('contact_id')

                if (colNameJoinedInUp !== primaryKey) {
                    throw Error(`${uniJoinedParams()} is based on DB \`${databaseName}\` table \`${TableName
                        }\` schema's UNIQUE single-column-foreign-key \`${colNameJoiningToUp
                        }\`, that REFERENCEs column \`${colNameJoinedInUp}\` of ${This.Name} table \`${
                        tableName}\`.\nThat colum name MUST match that of ${This.Name} .idDbName [${primaryKey}]`);
                }                                                                       //  To{Owner|Referencer}

                const { canBeNull, recName } = getFromRecordFieldToInsert(Record, colNameJoiningToUp, 'UNIQUE ');
                if (   canBeNull   ) {
                    logger.warn(`${uniJoinedParams()} is based on DB \`${databaseName}\` table \`${
                            TableName}\` schema's UNIQUE single-column-foreign-key \`${colNameJoiningToUp
                            }\`.\nThat table \`${TableName}\` column \`${colNameJoiningToUp
                            }\` schema would normally specify NOT NULL for a ${UniJoinedRecordParam}, but it isn't.`);
                }
            //  if ( ! canBeNull    AND                                 //  e.g.    Address : `contact_id`  NOT NULL
                else if ( ! Record._FieldsToOnlyInsert._map.get(colNameJoiningToUp)) {              //  ! Only Insert

                    logger.warn(`${uniJoinedParams()} is based on DB \`${databaseName}\` table \`${TableName
                                }\` schema's UNIQUE single-column-foreign-key \`${colNameJoiningToUp
                                }\`.\nThat table \`${TableName}\` column \`${colNameJoiningToUp
                                }\` schema specifies NOT NULL, and normally, it would therefore be defined as one of ${
                                Name} ._FieldsToOnlyInsert entry { colName:'${colNameJoiningToUp}', ... }, but it ${
                                            Record._FieldsToInsertAndUpdate._map.get(colNameJoiningToUp)  ?
                                `is defined as one of ${Name} ._FieldsToInsertAndUpdate entries instead`  : `isn't`}.`);
                }

                return Object.assign(uniJoinedFeedRecordParams, {
                    [litObNameParam]:               undefined===litObName  ?  propertyName  :  litObName,
                    [colNameJoiningToUpParam]:      colNameJoiningToUp,                     //  May override undefined
                    [colNameJoinedInUpParam]:       colNameJoinedInUp,
                    recNameJoiningTo:               recName,
                    joiningColNameCanBeNull:        canBeNull,
                    joiningUp:                      true,
                });
            }
        };

        //region _ReferencedFeedRecordsParams / referencedRecords

        //  Take _ReferencedFeedRecordsParams, that may have been overridden in FeedRecords with :
        //
        //      static get _ReferencedFeedRecordsParams() {
        //          return [
        //              { ReferencedFeedItemRecord,  referencePropertyName, referenceIdPropertyName, referenceIdLitObName=referenceIdPropertyName, colNameJoiningToReferenced, },
        //          ]
        //      };
        //  // e.g      {     : PractitionerRecord, :'primaryPractitioner', :'primaryFeedPractitionerId',                                          :'primary_practitioner_id', },
        //
        //   And enrich each element of it into :
        //
        //              { ReferencedFeedItemRecord,  referencePropertyName, referenceIdPropertyName, referenceIdLitObName=referenceIdPropertyName, colNameJoiningToReferenced, recNameJoiningTo, colNameJoinedInReferenced, referenceIdColName, },
        //
        //      e.g     {     : PractitionerRecord, :'primaryPractitioner', :'primaryFeedPractitionerId',           : 'primaryFeedPractitionerId', :'primary_practitioner_id', :'primary_practitioner_id',          : 'id',   : 'feed_item_id', },
        //
        //  colNameJoiningToReferenced: 'primary_practitioner_id' can be read from DB schema if a single PractitionerRecord foreign key is defined;
        //  recNameJoiningTo: very likely 'primary_practitioner_id', a copy of colName, is obtained from allInsertable._map, computed just above;
        //  colNameJoinedInReferenced: 'id' is read from DB schema;

        const ReferencedParamNames = {
            _UniJoinedFeedRecordsParamsParam: '_ReferencedFeedRecordsParams', UniJoinedRecordParam: 'ReferencedFeedItemRecord',
            propertyNameParam        :'referenceIdPropertyName',    litObNameParam         :'referenceIdLitObName',
            colNameJoiningToDownParam:'colNameJoiningToReferenced', colNameJoiningToUpParam:'colNameJoiningToReferencer',
            colNameJoinedInDownParam :'colNameJoinedInReferenced',  colNameJoinedInUpParam :'colNameJoinedInReferencer',

            referencePropertyNameParam:'referencePropertyName'
        };

        const referencedRecords = This._ReferencedFeedRecordsParams.map(
            referencedFeedRecordParams =>
                (completeParams => completeParams.joiningDown ? ReferencedFromReferencerFeedRecordParams(completeParams)
                                              /* .joiningUp */: ReferencedFromReferencedFeedRecordParams(completeParams)
                )( uniJoinedValidateAndComplete(referencedFeedRecordParams, ReferencedParamNames) )
        );
        referencedRecords.JoinedFromReferencerToReferenced = referencedRecords.filter(
                                            ({joinedFromReferencerToReferenced}) =>
                                                                                    joinedFromReferencerToReferenced);
        referencedRecords.JoinedFromReferencedToReferencer = referencedRecords.filter(
                                            ({joinedFromReferencedToReferencer}) =>
                                                                                    joinedFromReferencedToReferencer);

        Object.defineProperty(This,      '_ReferencedFeedRecordsParams', {value:referencedRecords});
        Object.defineProperty(thisProto, '_ReferencedFeedRecordsParams', {value:referencedRecords});

        const uniJoinedColNameSet = referencedRecords.reduce(                   //  set.add() returns set !
              /*    Part 1 :   */           (set, {colNameJoiningToReferenced}) =>
                                                                                    set.add(colNameJoiningToReferenced),
                           /* initial empty  set:*/ new Set() );    //  Part 2 : filled with uniOwnedRecords, below.
         //endregion

        //region _UniOwnedFeedRecordsParams / uniOwnedRecords

        //  Take _UniOwnedFeedRecordsParams, that may have been overridden in FeedRecords with :
        //
        //      static get _UniOwnedFeedRecordsParams() {
        //          return [
        //              { UniOwnedFeedRecord, ownerPropertyName,  ownerLitObName,                   (colNameJoiningToOwned || colNameJoiningToOwner),          },
        //          ]
        //      };
        //  // e.g      {    : ContactRecord,   : 'selfContact',                                      : 'self_contact_id',                                                                     },
        //
        //   And enrich each element of it into :
        //
        //              { UniOwnedFeedRecord, ownerPropertyName,  ownerLitObName=ownerPropertyName, colNameJoiningToOwned, recNameJoiningTo, colNameJoinedInOwned, colNameJoiningToOwner, recNameJoiningToOwner, colNameJoinedInOwner },
        //
        //      e.g     {    : ContactRecord,  :  'selfContact',  :'selfContact',                     : 'self_contact_id', :'self_contact_id',             : 'id',           : undefined,           : undefined,          : undefined },
        //      e.g     {:ReachabilityRecord,  : 'reachability',                                              : undefined,        : undefined,        : undefined,        : 'patient_id',    : 'self_contact_id',               : 'id'  },
        //
        //  colNameJoiningToOwned: 'self_address_id' can be read from DB schema if a single ContactRecord foreign key is defined;
        //  recNameJoiningTo: very likely 'self_address_id', a copy of colName, is obtained from allInsertable._map, computed just above;
        //  colNameJoinedInOwned: 'id' is read from DB schema;

        //  A table/recordClass ( y ) may be uniOwned by a table/recordClass x in two ways:
        //
        //      x ──>──( y )    owner ( x ) has a FOREIGN KEY   to a owned ( y ) UNIQUE (and most likely PRIMARY) KEY
        //      x ──<──( y )    owned ( y ) has a NOT NULL, UNIQUE (and maybe PRIMARY) FOREIGN KEY
        //                                                      to a owner ( x ) UNIQUE (and most likely PRIMARY) KEY.
        //
        //  CREATE TABLE x (                        //  owner  ─>─  CREATE TABLE y (                        //  owned
        //      id    bigint(20) NOT NULL AUTOINCREMENT PRIMARY,        id   bigint(20) NOT NULL AUTOINCREMENT PRIMARY,
        //      ...                                                     ...
        //      y_id  bigint(20) DEFAULT NULL,                      );
        //      KEY idx_y (y_id),
        //      FOREIGN KEY fk_x_y (y_id) REFERENCES y (id)
        //  );                                                  OR
        //
        //  CREATE TABLE x (                        //  owner  ─<─  CREATE TABLE y1 (                       //  owned
        //      id    bigint(20) NOT NULL AUTOINCREMENT PRIMARY,        id    bigint(20) NOT NULL AUTOINCREMENT PRIMARY,
        //      ...                                                     ...
        //  );                                                          x_id  bigint(20) NOT NULL,
        //                                                              UNIQUE KEY idx_x (x_id),
        //                                                              FOREIGN KEY fk_y1_x (x_id) REFERENCES x (id)
        //                                                          );                                      //   OR
        //                                                          CREATE TABLE y2 (
        //                                                                              //  no AUTOINCREMENT PRIMARY id,
        //                                                              x_id    bigint(20) NOT NULL,
        //                                                              ...
        //                                                              PRIMARY KEY (x_id),
        //                                                              FOREIGN KEY fk_y1_x (x_id) REFERENCES x (id)
        //                                                          );//  i.e. the PRIMARY KEY is the owner table x .id

        const UniOwnedParamNames = {
            _UniJoinedFeedRecordsParamsParam: '_UniOwnedFeedRecordsParams', UniJoinedRecordParam: 'UniOwnedFeedRecord',
            propertyNameParam         : 'ownerPropertyName',      litObNameParam          : 'ownerLitObName',
            colNameJoiningToDownParam : 'colNameJoiningToOwned',  colNameJoiningToUpParam : 'colNameJoiningToOwner',
            colNameJoinedInDownParam  : 'colNameJoinedInOwned',   colNameJoinedInUpParam  : 'colNameJoinedInOwner'
        };

        const uniOwnedRecords = This._UniOwnedFeedRecordsParams.map(
            /***
             *
             * @param ({UniOwnedFeedRecord: FeedRecord, ownerPropertyName: string, ownerLitObName: string,
             *          colNameJoiningToOwned: string, colNameJoiningToOwner: string }} uniOwnedFeedRecordParams
             * @returns {{Record: FeedRecord, propertyName: string, litObName: string, colNameJoiningTo: string, colNameJoinedIn: string, recNameJoiningTo: string, joiningColNameCanBeNull: boolean}}
             */
            uniOwnedFeedRecordParams =>
                (completeParams => completeParams.joiningDown ? UniOwnedFromOwnerFeedRecordParams(completeParams)
                                              /* .joiningUp */: UniOwnedFromOwnedFeedRecordParams(completeParams)
                )( uniJoinedValidateAndComplete(uniOwnedFeedRecordParams, UniOwnedParamNames) )
        );
        uniOwnedRecords.JoinedFromOwnerToOwned = uniOwnedRecords.filter(({joinedFromOwnerToOwned}) =>
                                                                                                joinedFromOwnerToOwned);
        uniOwnedRecords.JoinedFromOwnedToOwner = uniOwnedRecords.filter(({joinedFromOwnedToOwner}) =>
                                                                                                joinedFromOwnedToOwner);

        Object.defineProperty(This,      '_UniOwnedFeedRecordsParams', {value:uniOwnedRecords});
        Object.defineProperty(thisProto, '_UniOwnedFeedRecordsParams', {value:uniOwnedRecords});

        /*uniJoinedColNameSet :*/uniOwnedRecords.reduce(                            //  set.add() returns set !
        /*  Part 2 :  */                            (set, {colNameJoiningToOwned})  =>
        /*  Part 1 filled with  */                                                      set.add(colNameJoiningToOwned),
        /*  referencedRecords, above:       Initial  set:*/ uniJoinedColNameSet ); // Pre-filled with referencedRecords
                                                                                   //   by .colNameJoiningToReferenced.
        //endregion

        //region _MultiOwnedFeedRecordsParams / multiOwnedRecords, _AllJoinedMap

        //  Take _MultiOwnedFeedRecordsParams, that may have been overridden in FeedRecords with :
        //
        //      static get _MultiOwnedFeedRecordsParams() {
        //          return [
        //              { MultiOwnedFeedRecord,  ownerArrayPropertyName, ownerLitObArrayName=ownerArrayPropertyName },
        //          ]
        //      };
        //  // e.g      { : PractitionerLegitIdRecord,     : 'legitIds',       : 'practices' },
        //
        //   And enrich each element of it into :
        //
        //      {  MultiOwnedFeedRecord, ownerArrayPropertyName, ownerLitObArrayName, colNameJoiningToOwner, colNameJoinedInOwner },
        //
        //  e.g { : PractitionerLegitIdRecord,     : 'legitIds',       : 'practices',   : 'practitioner_id',               : 'id' },

        //  A table/recordClass ( y ) is multiOwned by a table/recordClass x  when:
        //
        //      x ──<──[ y ]    owned ( y ) has a NOT NULL, non-UNIQUE FOREIGN KEY
        //                                  to a owner ( x ) UNIQUE (and most likely PRIMARY) KEY.
        //
        //  CREATE Table x (                        //  owner  ─<─  CREATE Table y (                        //  owned
        //      id    bigint(20) NOT NULL AUTOINCREMENT PRIMARY,        id   bigint(20) NOT NULL AUTOINCREMENT PRIMARY,
        //      ...                                                     ...
        //  );                                                          x_id  bigint(20) NOT NULL,
        //                                                              KEY idx_x (x_id),           //  not UNIQUE !
        //                                                              FOREIGN KEY fk_y_x (x_id) REFERENCES x (id)
        //                                                          );

        const multiOwnedRecords = This._MultiOwnedFeedRecordsParams.map(
            /***
             *
             * @param {FeedRecord} MultiOwnedFeedRecord
             * @param {string} ownerArrayPropertyName
             * @param {string} colNameJoiningToOwner
             * @param {string} ownerLitObArrayName
             * @returns {{Record: FeedRecord, propertyName: string, litObName: string, colNameJoiningTo: string, joiningColNameCanBeNull: boolean, recNameJoiningTo: string, colNameJoinedIn: string, }}
             */
        // e.g. PractitionerLegitIdRecord,       'legitIds',                        ownerLitObArrayName:'practices' }
            ({ MultiOwnedFeedRecord, ownerArrayPropertyName, colNameJoiningToOwner, ownerLitObArrayName, }) => {

                const multiOwnedParams = () => `${This.Name}._MultiiOwnedFeedRecordsParams entry : { MultiOwnedFeedRecord: ${
                            MultiOwnedFeedRecord  ?  MultiOwnedFeedRecord.Name  :  JSON.stringify(MultiOwnedFeedRecord)
                                                }, ownerArrayPropertyName: ${JSON.stringify(ownerArrayPropertyName)
                                                }${undefined === ownerLitObArrayName ? '' :
                                                `, ownerLitObArrayName: ${JSON.stringify(ownerLitObArrayName)}`
                                                }${undefined === colNameJoiningToOwner ? '' :
                                                `, colNameJoiningToOwner: ${JSON.stringify(colNameJoiningToOwner)}`
                                                }, ... }`;

                const missing = [];
                if (undefined === MultiOwnedFeedRecord) missing.push('property .MultiOwnedFeedRecord');
                if (undefined === ownerArrayPropertyName) missing.push('property .ownerArrayPropertyName');

                const missingStr = missing.join(' and ');
                if (missingStr) {
                    throw Error(missingStr + ` MUST be defined in ${multiOwnedParams()}.`);
                }

                //  First, .MultiOwnedFeedRecord DB schema must include a foreign key pointing back to This.

                const { Name, TableName } = MultiOwnedFeedRecord;
                //  e.g.  in  PractitionerRecord ._MultiOwnedFeedRecordsParams :
                //                  PractitionerLegitIdRecord._ForeignKeyMapByTableName['Practitioner']
                const foreignKeyMap = MultiOwnedFeedRecord._ForeignKeyMapByTableName[tableName];
                if (undefined === foreignKeyMap) {
                    throw Error(`In DB \`${databaseName}\`, table \`${TableName}\` schema for ${Name
                                }, has no single-column-foreign-key defined which REFERENCEs ${This.Name
                                }'s table \`${tableName}\` :\nFix the ${multiOwnedParams()
                                } that requires such a foreign key in DB schema.`);
                }

                //  A set of single-column-foreign-key is found in MultiOwnedFeedRecord DB schema,
                //  which REFERENCE table_name is This.TableName

                //  Then, either .colNameJoiningToOwner is undefined and we try to pick it from DB schema foreign key
                //            or .colNameJoiningToOwner is defined and we validate it.


                let colNameJoinedInOwner;

                if (undefined === colNameJoiningToOwner) {                  //  Try get it from DB schema foreign key
                    if (foreignKeyMap.size > 1) {
                        throw Error(`DB \`${databaseName}\` table \`${TableName}\` schema for ${Name
                            }, defines many single-column-foreign-keys (i.e. ${  //  .keys() === fkColNames
                            Array.from(foreignKeyMap.keys()).map(colName =>'`'+colName+'`').join(', ')
                            }) that REFERENCEs back ${This.Name}'s table \`${tableName}\` :\nFix the ${multiOwnedParams()
                            }, by adding a .colNameJoiningToOwner property to pick one of these foreign keys.`);
                    }
                // e.g.   [ 'practitioner_id', 'id' ]                                           // Just the one entry
                    ( [ colNameJoiningToOwner, colNameJoinedInOwner ] = foreignKeyMap.entries().next().value);
                }
                else {                                                      //  Validate .colNameJoiningToOwner
                    //  e.g.  in  PractitionerRecord ._MultiOwnedFeedRecordsParams :
                    //  PractitionerLegitIdRecord._ForeignKeyMapByTableName['Practitioner'].get('practitioner_id');
                           colNameJoinedInOwner = foreignKeyMap.get(colNameJoiningToOwner);         //  e.g.    'id'
                    if ( ! colNameJoinedInOwner ) {
                        throw Error(                    //  .colNameJoiningToOwner is not a foreign key in DB schema.
                                `${multiOwnedParams()} is based on ${Name} DB \`${databaseName}\` table \`${TableName
                                }\` schema.\nIt includes single-column-foreign-key${ foreignKeyMap.size > 1 
                                                             //  .keys === fkColNames       
                                ? `s (${ Array.from(foreignKeyMap.keys()).map(colName =>'`'+colName+'`').join(', ')
                                    }), which REFERENCEs back that owner ${This.Name} table \`${tableName
                                    }\`.\nProperty .colNameJoiningToOwner MUST match one of these foreign key names.`
                                                    //   .keys()[0] === fkColName
                                : `\`${foreignKeyMap.keys().next().value
                                    }\`, which REFERENCEs back that owner ${This.Name} table \`${tableName
                                    }\`.\nProperty .colNameJoiningToOwner MUST match this foreign key name or be undefined.`
                                    }`);
                    }
                }
                //  At this point, either colNameJoiningToOwner is defined and valid.

                //  In both cases above, colNameJoinedInOwner was read from foreignKeyMap, so we now can validate it !
                if (colNameJoinedInOwner !== primaryKey) {
                    throw Error(`${multiOwnedParams()} is based on DB \`${databaseName}\` table \`${TableName
                        }\` schema's single-column-foreign-key \`${colNameJoiningToOwner
                        }\`, that REFERENCEs column \`${colNameJoinedInOwner}\` of ${This.Name} table \`${tableName
                        }\`.\nThat colum name MUST match that of ${This.Name} .idDbName [${primaryKey}]`);
                }

                /**
                 * @type {string}
                 */
                const { recName  :recNameJoiningTo,
                        canBeNull:joiningColNameCanBeNull,
                } = MultiOwnedFeedRecord._FieldsToInsert._map.get(colNameJoiningToOwner);

                if (joiningColNameCanBeNull) {
                    logger.warn(`${multiOwnedParams()} is based on DB \`${databaseName}\` table \`${TableName
                        }\` schema's single-column-foreign-key \`${colNameJoiningToOwner
                        }\`.\nThat table \`${TableName}\` column \`${colNameJoiningToOwner
                        }\` schema would normally specify NOT NULL for a MultiOwnedFeedRecord, but it isn't.`);
                }
            //  if ( ! joiningColNameCanBeNull  AND             //  e.g.    PatientLegitId : `patient_id`  NOT NULL
                else if ( ! MultiOwnedFeedRecord._FieldsToOnlyInsert._map.get(colNameJoiningToOwner)) {

                    logger.warn(`${multiOwnedParams()} is based on DB \`${databaseName}\` table \`${TableName
                        }\` schema's single-column-foreign-key \`${colNameJoiningToOwner
                        }\`. That table \`${TableName}\` column \`${colNameJoiningToOwner
                        }\` schema specifies NOT NULL, and normally, it would therefore be defined as one of ${
                        Name} ._FieldsToOnlyInsert entry { colName:'${colNameJoiningToOwner}', ... }, but it ${
                        MultiOwnedFeedRecord._FieldsToInsertAndUpdate._map.get(colNameJoiningToOwner) ? 
                            `is defined as one of ${Name} ._FieldsToInsertAndUpdate entries instead` : `isn't`}.`);
                }

                return MultiOwnedFeedRecordParams({
                    MultiOwnedFeedRecord,
                    ownerArrayPropertyName,
                    ownerLitObArrayName: undefined===ownerLitObArrayName ? ownerArrayPropertyName : ownerLitObArrayName,
                    colNameJoiningToOwner,
                    colNameJoinedInOwner,   //  === primaryKey                                  //  e.g. 'id'
                    recNameJoiningTo,
                    joiningColNameCanBeNull,
                });
            }
        );

        Object.defineProperty(This,      '_MultiOwnedFeedRecordsParams', {value:multiOwnedRecords});
        Object.defineProperty(thisProto, '_MultiOwnedFeedRecordsParams', {value:multiOwnedRecords});

        for (let { MultiOwnedFeedRecord, ownerLitObArrayName } of multiOwnedRecords) {
            const feedItemName = `${This.FeedItemName} .${ownerLitObArrayName}`;    //  e.g. 'Practitioner .practices'
            Object.defineProperty(MultiOwnedFeedRecord,            'FeedItemName', {value:feedItemName});
            Object.defineProperty(MultiOwnedFeedRecord.prototype,  'FeedItemName', {value:feedItemName});
        }

        const allJoinedMapByPropertyName = referencedRecords.reduce(            //  map.set() returns map !
            /*  step 1: add referencedRecords:  */                  (map, joined) =>
                                                                                    map.set(joined.propertyName, joined),
                                                    /*initial empty  map:*/ new Map());

                                             uniOwnedRecords.reduce(
            /*  step 2: add uniOwnedRecords:    */                  (map, joined) =>
                                                                                    map.set(joined.propertyName, joined),
                    /* partially filled allJoinedMapByPropertyName   map:*/ allJoinedMapByPropertyName);

                                           multiOwnedRecords.reduce(
            /*  step 3: add multiOwnedRecords:    */                (map, joined) =>
                                                                                    map.set(joined.propertyName, joined),
                    /* partially filled allJoinedMapByPropertyName   map:*/ allJoinedMapByPropertyName);

        //endregion

        //region ShaAndUuid

        //  sha256 and uuid binary/varbinary can always be inserted: can't DEFAULT to anything meaningful but NULL.

        const allShaAndUuidInsertable = allInsertable.filter( keepShaAndUuidFields );

        This._ShaAndUuidSelectFcn = (tblName, tblPrefix='', shaAndUuidSelects=[]) => {

            shaAndUuidSelects.push(shaAndUuidSelectFcn(tblName, allShaAndUuidInsertable));

            for (let { UniOwnedFeedRecord, ownerPropertyName} of uniOwnedRecords) {
                const ownedFullTblName = tblPrefix + ownerPropertyName;
                UniOwnedFeedRecord._ShaAndUuidSelectFcn(ownedFullTblName, nextTblPrefix(ownedFullTblName), shaAndUuidSelects);
            }
            for (let {ReferencedFeedItemRecord, referencePropertyName} of referencedRecords) {
                const referencedFullTblName = tblPrefix + referencePropertyName;
                shaAndUuidSelects.push(                     //  just the _uuidField  e.g. {colName:'feed_item_id', ...}
                    shaAndUuidSelectFcn(referencedFullTblName, [ ReferencedFeedItemRecord._uuidField] ));
            }//  e.g. ', BIN_TO_UUID(`primaryPractitioner`.`feed_item_id`,1) AS `primaryPractitioner__feed_item_id_hex`'
            return shaAndUuidSelects;
        };
        const shaAndUuidSelects = This._ShaAndUuidSelectFcn(tableName);

        const shaAndUuidRowFixer = shaAndUuidRowFixerFnc(allShaAndUuidInsertable, tableName);
        This._FixShaAndUuidOfRow = allShaAndUuidInsertable.length  ?  row => fixShaAndUuidOfRow(row, shaAndUuidRowFixer)
                                                                   :  row => row;  //  straight pass thru
                                                                                   //  if no shaAndUuid in this table

        const assignStrByColName = allInsertable.reduce(
                            (map, {colName, eType}) =>      //  map.set() returns map !
                                        map.set(colName, ((assignStr=' = ?') => assignStr   //  Default assignment str
                                                         )( {   //  uuid and sha special assignment string
                                                                [eUuidDbJsType] : ' = UUID_TO_BIN( ?, 1)',
                                                                [eShaDbJsType]  : ' = UNHEX( ? )',
                                                            }[eType] )                                      ),
        /* initial value of  map:*/ new Map());

        This._AssignStrByColName = colName =>
                                               assignStrByColName.get(colName) || ' = ?';

        This._ShaAndUuidNamesFnc = tblFullName  =>
                                                    shaAndUuidNamesFnc(allShaAndUuidInsertable, tblFullName);

        const shaAndUuidNames = This._ShaAndUuidNamesFnc(tableName);
        Object.defineProperty(This, '_ShaAndUuidNames', {value: shaAndUuidNames});

        //endregion

        //region Fetch/Select/Get*() helpers:  _SqlSelect, _SqlFrom, _MultiSqlSelectFroms, _FetchAndBuild

        //region MultiOwned fetch queries builder

        //  Picture the following DB schema, of a tree of tables owned by table A where:
        //
        //          w ──<──[ x ]    table [ x ] is a join node that's multiOwned by table w,
        //          w ──>──( y )    table ( y ) is a join node that's   uniOwned by table w and
        //          w ──<──( z )    table ( z ) is a join node that's   uniOwned by table w, using a UNIQUE KEY in y.
        //
        //           w ─>─{u}       table ( u ) is a join node that's referenced by table w and
        //           w ─<─{v}       table ( v ) is a join node that's referenced by table w, using a UNIQUE KEY in v.
        //
        //   Top                            NOTE:   though present, not all referenced tables are pictured, as they're
        //  Owner                                   never join links in the graph, just terminal nodes to be fetched.
        //    A ──<──[ B ]──>──( I )
        //    |        ├────>──( J )──<──[ C ]──>──( D )
        //    |        |          └───>──( M )─>─{U}
        //    |        └────>──( K )──>──( I1 )
        //    |                  └────>──( I2 )
        //    ├───>─( J1 )──<──[ C ]──>──( D )
        //    |        └────>──( M )─>─{U}
        //    ├───>─( J2 )──<──[ C ]──>──( D )
        //    |        └────>──( M )─>─{U}
        //    ├───<──( L )──<──[ E ]──>──( M1 )─>─{U}
        //    |                  └────>──( M2 )─>─{U}
        //    ├───>──( F )──>──( G2 )─<──[ H ]──<──[ N ]
        //    |                  ├────<──[ O1 ]─>──( G1 )─<──[ O0 ]─>──( G0 )
        //    |                  └────>──( I )
        //    └───>──( P )──<──[ Q ]──>──( I )
        //             └────>──( P )──<──[ Q ]──>──( I )

        //  The entire structure can be easily fetched and demuxed with 6 sql queries for the following
        //      sub trees of uniOwned (and referenced, yet not all pictured/included in sql queries) tables:
        //
        //      1)   A  ──>─( J1 )──>──( M )─>─{U}  SELECT A.*, j1.*, j1_m.*, j1_m_u.uuid, j2.*, j2_m.*, j2_m_u.uuid, f.*, f_g.*, f_g_i.*, l.*, p.*, p_p0.*   (+ shaAndUuids)
        //           ├────>─( J2 )──>──( M )─>─{U}    FROM A
        //           ├────<──( L )                      [LEFT] JOIN J AS j1 ON  A.j1_id = j1.id
        //           └────>──( F )──>──( G )            [LEFT] JOIN J AS j2 ON  A.j2_id = j2.id
        //                                              [LEFT] JOIN L AS l  ON  A.id  = l.a_id
        //                                              [LEFT] JOIN F AS f  ON  A.f_id  = f.id
        //                                              [LEFT] JOIN P AS p  ON  A.p_id  = p.id
        //                                              [LEFT] JOIN M AS j1_m ON  j1.m_id  = j1_m.id
        //                                              [LEFT] JOIN M AS j2_m ON  j2.m_id  = j2_m.id
        //                                              [LEFT] JOIN G AS f_g  ON  f.g_id   = f_g.id
        //                                              [LEFT] JOIN P AS p_p0 ON  p.p_id   = p_p0.id
        //                                              [LEFT] JOIN I AS f_g_i  ON  f_g.i_id  = f_g_i.id
        //                                              [LEFT] JOIN U AS j1_m_u ON  j1_m.u_id = j1_m_u.id
        //                                              [LEFT] JOIN U AS j2_m_u ON  j2_m.u_id = j2_m_u.id
        //                                             ${criteriaString}
        //
        //      2) [ B ]──>──( I )                  SELECT B.*, i.*, j.*, j_m.*, j_m_u.uuid, k.*, k_i1.*, k_i2.*    (+ shaAndUuids)
        //           ├────>──( J )──>──( M )─>─{U}    FROM B
        //           └────>──( K )──>──( I1 )         [LEFT] JOIN I AS i ON  B.i_id = i.id
        //                     └────>──( I2 )         [LEFT] JOIN J AS j ON  B.j_id = j.id
        //                                            [LEFT] JOIN K AS k ON  B.k_id = k.id
        //                                            [LEFT] JOIN M AS j_m  ON  j.m_id = j_m.id
        //                                            [LEFT] JOIN I AS k_i1 ON  k.i1_id = k_i1.id
        //                                            [LEFT] JOIN I AS k_i2 ON  k.i2_id = k_i2.id
        //                                            [LEFT] JOIN U AS j_m_u ON  j_m.u_id = j_m_u.id
        //                                           WHERE EXISTS (
        //                                               SELECT 1
        //                                                 FROM ( SELECT `A`.* FROM `A`
        //                                                         ${criteriaString} ) AS `A`
        //                                                WHERE  A.id = B.a_id
        //                                           )
        //
        //      3) [ C ]──>──( D )              SELECT C.*, d.*                                         (+ shaAndUuids)
        //                                        FROM C
        //                                        [LEFT] JOIN D AS d ON  C.d_id = d.id
        //                                       WHERE EXISTS (
        //                                           SELECT 1
        //                                             FROM ( SELECT `A`.* FROM `A`
        //                                                     ${criteriaString}) AS A
        //                                             JOIN B AS bs ON  A.id = bs.a_id      //  All JOIN L are skipped
        //                                            WHERE  bs.j_id = C.j_id  OR  A.j1_id = C.j_id  OR  A.j2_id = C.j_id
        //                                       )
        //
        //      4) [ E ]──>──( M1 )             SELECT E.*, m1.*, m1_u.uuid, m2.*, m2_u.uuid            (+ shaAndUuids)
        //           └────>──( M2 )               FROM E
        //                                        [LEFT] JOIN M AS m1 ON  E.m1_id = m1.id
        //                                        [LEFT] JOIN M AS m2 ON  E.m2_id = m2.id
        //                                        [LEFT] JOIN U AS m1_u ON  m1.u_id = m1_u.id
        //                                        [LEFT] JOIN U AS m2_u ON  m2.u_id = m2_u.id
        //                                       WHERE EXISTS (
        //                                           SELECT 1
        //                                             FROM ( SELECT `A`.* FROM `A`
        //                                                     ${criteriaString}) AS A
        //                                             JOIN L AS l ON  A.id = l.a_id
        //                                            WHERE  l.id = E.l_id                  //  JOIN L is NOT skipped
        //                                       )
        //
        //      5) [ H ]                        SELECT H.*                                              (+ shaAndUuids)
        //                                        FROM H
        //                                       WHERE EXISTS (
        //                                           SELECT 1
        //                                             FROM ( SELECT `A`.* FROM `A`
        //                                                     ${criteriaString}) AS A
        //                                             [LEFT] JOIN F AS f ON  A.f_id = f.id
        //                                            WHERE  f.g_id = H.g_id                    //  JOIN G is skipped
        //                                       )
        //
        //      6) [ N ]                        SELECT N.*                                              (+ shaAndUuids)
        //                                        FROM N
        //                                       WHERE EXISTS (
        //                                           SELECT 1
        //                                             FROM ( SELECT `A`.* FROM `A`
        //                                                     ${criteriaString}) AS A
        //                                             [LEFT] JOIN F AS f ON  A.f_id = f.id     //  JOIN G is skipped
        //                                             JOIN H AS f_g_hs ON  f.g_id = f_g_hs.g_id
        //                                            WHERE  f_g_hs.id = N.h_id
        //                                       )
        //
        //      7) [ O ]──>──( G )              SELECT O.*, g.*                                 (+ shaAndUuids)
        //                                        FROM O
        //                                        [LEFT] JOIN G AS g ON  O.next_g_id = g.id
        //                                       WHERE EXISTS (
        //                                           SELECT 1
        //                                             FROM ( SELECT `A`.* FROM `A`
        //                                                     ${criteriaString}) AS A
        //                                             [LEFT] JOIN F AS f ON  A.f_id = f.id     //  JOIN G is skipped
        //                                             JOIN O AS f_g_os ON  f.g_id = f_g_os.prev_g_id
        //                                            WHERE  f.g_id = O.prev_g_id  OR  f_g_os.next_g_id = O.prev_g_id
        //                                       )     //  todo fix limited recursive fetch generating erroneous JOIN
        //
        //      7) [ Q ]──>──( I )              SELECT Q.*, i.*                                 (+ shaAndUuids)
        //                                        FROM N
        //                                        [LEFT] JOIN I AS i ON  Q.i_id = i.id
        //                                       WHERE EXISTS (
        //                                           SELECT 1
        //                                             FROM ( SELECT `A`.* FROM `A`
        //                                                     ${criteriaString}) AS A
        //                                             [LEFT] JOIN P AS p ON  A.p_id = p.id   //  JOIN P is NOT skipped
        //                                            WHERE  `p`.`id` = `Q`.`p_id`  OR  `p`.`p_id` = `Q`.`p_id`
        //                                       )

        //  NOTE:
        //          It's taken for granted that the DB will be more efficient at joining than
        //          anything JS code could do. So we try to reduce the number of fetchFromDB
        //          to the minimum that could return distinct rows. Which seems to be : one for
        //          the top owner table, plus one for each multiOwned table of an owned tree,
        //          no matter how many times a table is owned, at different levels of that tree.
        //          (see " 3) [ C ] " and " 7) [ Q ] " above).
        //
        //          For the multiOwned table queries, the ${criteriaString} is applied on the
        //          top owner table (e.g. A) using a sub query, because it might include
        //          "LIMIT ?, OFFSET ?" and such a sub query is the only way for LIMIT/OFFSET
        //          to work as intended.
        //          todo Just SELECT FROM A the *ids used by the following JOINs of the WHERE EXISTS sub query rather than *
        //
        //          In cases similar to C, the (INNER) JOIN of multiOwned table B in parallel
        //          with uniOwned j1 and j2 of A, would cause all the joined instances of j1_c
        //          and j2_c (plus j1_c_d and j2_c_d) to be returned as many TIMES as there
        //          are rows b_j_c also joined to a common A row.   i.e.  Bs x (j1_Cs + j2_Cs) rows.
        //          e.g. when:
        //                      1.3) - C :  FROM (SELECT * FROM A
        //                                         ${criteriaString}) AS A
        //                                  JOIN B AS bs ON  A.id = bs.a_id             //  JOIN J1 and J2 are skipped
        //                                  JOIN C ON  bs.j_id = C.j_id  OR  A.j1_id = C.j_id  OR  A.j2_id = C.j_id
        //
        //          For large amount of Bs and jx_Cs joined to a row A, that can add up fast
        //          to huge waste of bandwidth that is entirely avoidable. A lazy way to fix
        //          this is to use SELECT DISTINCT, but the entire world seems to agree about
        //          how poorly SELECT DISTINCT performs in any DBMS. The agreed solution is
        //          to use SEMI JOIN. In SQL, these are stated using WHERE EXISTS/WHERE IN.
        //
        //  The following code is thus meant to auto-craft the above query plan...
        //
        //  The above queries can be split in two parts :

        //      1) The JOIN section to reach from the base table/recordClass to itself (trivial: A ) or one of
        //          the 5 other multiOwned table/classRecord ( B, C, E, N, H ) i.e.:
        //          1.1) - A :  FROM A
        //          1.2) - B :  FROM B
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString} ) AS `A`
        //                          WHERE  A.id = B.a_id
        //                     )
        //          1.3) - C :  FROM C
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString} ) AS `A`
        //                           JOIN B AS bs ON  A.id = bs.a_id                //  JOIN J1 and J2 are skipped
        //                          WHERE  bs.j_id = C.j_id  OR  A.j1_id = C.j_id  OR  A.j2_id = C.j_id
        //                     )
        //          1.4) - E :  FROM E
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString} ) AS `A`
        //                           JOIN L AS l ON  A.id = l.a_id
        //                          WHERE  l.id = E.l_id                            //  JOIN L is NOT skipped
        //                     )
        //          1.5) - H :  FROM H
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString} ) AS `A`
        //                           [LEFT] JOIN F AS f ON A.f_id = f.id
        //                          WHERE  f.g_id = H.g_id                          //  JOIN G is skipped
        //                     )
        //          1.6) - N :  FROM N
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString} ) AS `A`
        //                           [LEFT] JOIN F AS f ON  A.f_id = f.id
        //                           JOIN H AS f_g_hs ON  f.g_id = f_g_hs.g_id      //  JOIN G is skipped
        //                          WHERE  f_g_hs.id = N.h_id
        //                     )
        //          1.7) - O :  FROM O
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString}) AS A
        //                           [LEFT] JOIN F AS f ON  A.f_id = f.id           //  JOIN G is skipped
        //                           JOIN O AS f_g_os ON  f.g_id = f_g_os.prev_g_id
        //                          WHERE  f.g_id = O.prev_g_id  OR  f_g_os.next_g_id = O.prev_g_id
        //                     )
        //          1.8) - Q :  FROM Q
        //                     WHERE EXISTS (
        //                         SELECT 1
        //                           FROM ( SELECT `A`.* FROM `A`
        //                                   ${criteriaString} ) AS `A`
        //                           [LEFT] JOIN P AS p ON  A.p_id = p.id           //  JOIN P is NOT skipped
        //                          WHERE  p.id = Q.p_id  OR  p.p_id = Q.p_id
        //                     )

        //      2) The JOIN section used in the SELECT, accessing the top owner table/recordClass
        //          itself (e.g. A ) and target multiOwned table/classRecord ( B, C, E, N, H ) plus all
        //          downstream uniOwned (and referenced, not all included here) table/classRecord subtree,
        //          down to (and not including) any other multiOwned table/classRecord, i.e. :
        //          2.1) - A :  FROM A
        //                      [LEFT] JOIN J AS j1 ON  A.j1_id = j1.id
        //                      [LEFT] JOIN J AS j2 ON  A.j2_id = j2.id
        //                      [LEFT] JOIN L AS l  ON  A.l_id  = l.id
        //                      [LEFT] JOIN F AS f  ON  A.f_id  = f.id
        //                      [LEFT] JOIN P AS p  ON  A.p_id  = p.id
        //                      [LEFT] JOIN M AS j1_m ON  j1.m_id  = j1_m.id
        //                      [LEFT] JOIN M AS j2_m ON  j2.m_id  = j2_m.id
        //                      [LEFT] JOIN G AS f_g  ON  f.g_id   = f_g.id
        //                      [LEFT] JOIN P AS p_p0 ON  p.p_id   = p_p0.id
        //                      [LEFT] JOIN I AS f_g_i  ON  f_g.i_id  = f_g_i.id
        //                      [LEFT] JOIN U AS j1_m_u ON  j1_m.u_id = j1_m_u.id
        //                      [LEFT] JOIN U AS j2_m_u ON  j2_m.u_id = j2_m_u.id
        //               //  NOTE:  Neither B nor C, E, H, Q multiOwned table/recordClass of A, j1, j2, l, f_g, p and p_p0 are included
        //          2.2) - B :  JOIN B          //  On whatever conditions
        //                      [LEFT] JOIN I AS i ON  B.i_id = i.id
        //                      [LEFT] JOIN J AS j ON  B.j_id = j.id
        //                      [LEFT] JOIN K AS k ON  B.k_id = k.id
        //                      [LEFT] JOIN M AS j_m  ON  j.m_id = j_m.id
        //                      [LEFT] JOIN I AS k_i1 ON  k.i1_id = k_i1.id
        //                      [LEFT] JOIN I AS k_i2 ON  k.i2_id = k_i2.id
        //                      [LEFT] JOIN U AS j_m_u ON  j_m.u_id = j_m_u.id
        //               //  NOTE:  multiOwned table/recordClass C of j is not included.
        //          2.3) - C :  JOIN C          //  On whatever conditions
        //                          [LEFT] JOIN D AS d ON  C.d_id = d.id
        //          2.4) - E :  JOIN E          //  On whatever conditions
        //                          [LEFT] JOIN M AS m1 ON  E.m1_id = m1.id
        //                          [LEFT] JOIN M AS m2 ON  E.m2_id = m2.id
        //                          [LEFT] JOIN U AS m1_u ON  m1.u_id = m1_u.id
        //                          [LEFT] JOIN U AS m2_u ON  m2.u_id = m2_u.id
        //          2.5) - H :  JOIN H          //  On whatever conditions
        //                      //  No uniOwned downstream, but maybe some referenced table/recordClass, not included.
        //               //  NOTE:  multiOwned table/recordClass N of H is not included.
        //          2.6) - N :  JOIN H          //  On whatever conditions
        //                      //  No uniOwned downstream, but maybe some referenced table/recordClass, not included.
        //          2.7) - O :  JOIN O          //  On whatever conditions
        //                      [LEFT] JOIN G AS g ON  O.next_g_id = g.id
        //          2.8) - Q :  JOIN Q          //  On whatever conditions
        //                      [LEFT] JOIN I AS i ON  Q.i_id = i.id
        //      NOTES:
        //              a)  As usual, each of these JOIN might be LEFT JOIN, if the schema of the
        //                      column used as foreign key in the JOIN bears no NOT NULL attribute;
        //              b)  Neither A nor B, C, E, H, N, O or Q tables are aliased in the above
        //                       queries,  i.e. no "B AS b", or "C AS c", etc;
        //              c)  This allows for the same ._SqlFrom string, already used as the JOIN tree
        //                      for uniOwned/referenced of the top owner (e.g. A) table/recordClass,
        //                      to be also used to build the uniOwned/referenced JOIN subtrees of
        //                      the multiOwned B, C, E, H, N, O and Q downstream tables/classRecords.

        //  Therefore, all that is left to do, is to build for each of the multiOwned
        //  tables/classRecords such as B, C, E, H, N, O and Q, the JOIN path(s) to reach
        //  from top owner table A to all multiOwned occurrence of these downstream tables.
        //
        //  NOTE :  there might be multiple occurrences, such as for table C above, for which
        //           the WHERE clause will include many conditions OR-ed together.
        //          e.g.    WHERE  C.j_id = b.j_id  OR  C.j_id = A.j1_id  OR  C.j_id = A.j2_id

        //  WHAT IS MISSING:
        //
        //      - If, in a Full Owned tree, two or more multiOwned shares the same schema but
        //          different Record class with different uniOwned and referenced subtrees,
        //          they will currently share the same JOIN section used in SELECT (see "2)",
        //          above), the class selected (the last one .Setup()) might not fit all cases.
        //          Such multiOwned would need to be fetched separately, rather than together.
        //
        //      - Recursive multiOwned, limited in recursion by different Record class (see "2.7") at each
        //          level, generates erroneous JOIN statements right now. There's a to-do covering it.

        //   FullOwned : Uni & Multi Owned
        This.FullOwnedTreeParser = ({validationErrors=[], level=1, tblPrefix='', prevLevelJoinedNode={
                                        tblFullName: tableName, pathOfTblFullNames:[tableName], pathOfJoinedNodes:[],
                                        pathRecMapOb:{}, level:0, ownedFeedRecordParams:{Record:This, },
                                    }, joinedNodesByTblFullName={[tableName]:prevLevelJoinedNode},
                                    byMultiOwnedTblNameMap=new Map(), thisPathRecMapOb={[tableName]:0}, }) => {

            const {Name, _UniOwnedFeedRecordsParams, _MultiOwnedFeedRecordsParams} = This;

            const thisPathRecLevel = prevLevelJoinedNode.pathRecMapOb[Name];
            if (thisPathRecLevel) {
                validationErrors.push(`${Name} is already part of the joined table path [${tblPrefix}] at level [${
                                        thisPathRecLevel}], can't add element [${prevLevelJoinedNode.tblFullName}].`);
                return;
            }
            else {
                prevLevelJoinedNode.pathRecMapOb[Name] = level;     //  To make sure there's no circular reference.
            }

            // const colNameJoiningToFnc = next =>
            //                                     next.colNameJoiningTo;
            //
            const newJoinedNode = (tblFullName, ownedFeedRecordParams) => {
                const pathOfTblFullNames = prevLevelJoinedNode.pathOfTblFullNames.concat([tblFullName]);
                return {
                    tblFullName,
                    pathOfTblFullNames,
                    pathOfJoinedNodes: pathOfTblFullNames.map(
                                                              tblFullName =>
                                                                             joinedNodesByTblFullName[tblFullName]),
                    pathRecMapOb: { ...prevLevelJoinedNode.pathRecMapOb },          //  cloned at every Node
                    level,
                    // colNameJoiningToFnc,
                    ownedFeedRecordParams,
                };
            };

            for (let ownedFeedRecordParams of _MultiOwnedFeedRecordsParams) {

            // MultiAddressRec   addresses
                const {Record, propertyName} = ownedFeedRecordParams;
                const tblFullName = tblPrefix + propertyName;


                const joinedNodeAlreadyInPath = joinedNodesByTblFullName[tblFullName];
                if (joinedNodeAlreadyInPath) {    //  Invalid if 2 uni|multi Owned of a same Rec have the same name
                    validationErrors.push(`joinedNodeAlreadyInPath : ${niceJSON(joinedNodeAlreadyInPath)}`);
                    continue;
                }

                const joinedNode = newJoinedNode(tblFullName, ownedFeedRecordParams),
                      {pathOfJoinedNodes} = joinedNode;
                //       { ...copyOfBaseNode } = pathOfJoinedNodes[0];
                //
                // pathOfJoinedNodes[0] = {
                //     ...copyOfBaseNode,
                //     colNameJoiningToFnc,
                // };
                pathOfJoinedNodes[pathOfJoinedNodes.length-1] = joinedNode;
                joinedNodesByTblFullName[tblFullName] = joinedNode;

                let  byMultiOwnedTblName =  byMultiOwnedTblNameMap.get(Record.TableName);
                if (!byMultiOwnedTblName) {
                    byMultiOwnedTblName = Object.assign(new Map(), {
                        OwnerTblName: tableName,
                        ownedFeedRecordParams,
                    });

                    byMultiOwnedTblNameMap.set(Record.TableName, byMultiOwnedTblName);
                }
                byMultiOwnedTblName.set(tblFullName, joinedNode);

                Record.FullOwnedTreeParser({ validationErrors, level:level+1,
                    tblPrefix:nextTblPrefix(tblFullName), prevLevelJoinedNode:joinedNode, joinedNodesByTblFullName,
                    byMultiOwnedTblNameMap, thisPathRecMapOb, });
            }

            for (let ownedFeedRecordParams of _UniOwnedFeedRecordsParams) {
            // MultiContactRec, selfContact
                const {Record, propertyName} = ownedFeedRecordParams;
                const tblFullName = tblPrefix + propertyName;

                const joinedNodeAlreadyInPath = joinedNodesByTblFullName[tblFullName];
                if (joinedNodeAlreadyInPath) {    //  Invalid if 2 uni|multi Owned of a same Rec have the same name
                    validationErrors.push(`joinedNodeAlreadyInPath : ${niceJSON(joinedNodeAlreadyInPath)}`);
                    continue;
                }

                const joinedNode = newJoinedNode(tblFullName, ownedFeedRecordParams);
                joinedNodesByTblFullName[tblFullName] = joinedNode;

                Record.FullOwnedTreeParser({ validationErrors, level:level+1,
                    tblPrefix:nextTblPrefix(tblFullName), prevLevelJoinedNode:joinedNode, joinedNodesByTblFullName,
                    byMultiOwnedTblNameMap, thisPathRecMapOb, });
            }
            return Array.from(byMultiOwnedTblNameMap.values());
        };

        //  Parse the Full (Uni and Multi) Owned tree.

        const fullOwnedTreeValidationErrors = [];
        const multiOwnedSubTrees = This.FullOwnedTreeParser({validationErrors:fullOwnedTreeValidationErrors});
        if (fullOwnedTreeValidationErrors.length) {
            throw Error(`${This.Name}.FullOwnedTreeParser()\n${fullOwnedTreeValidationErrors.join('\n')}`);
        }

        //  Build the multiOwned tree of join table paths, then, build the JOINs from that multiOwnedTreeMapOb.

        //        Set {'bs_j_cs':joinedNode, 'j1_cs':joinedNode, 'j2_cs':joinedNode }     //  NOTE: for multiOwned table C all finishes with 'cs', etc...
        for (let joinedNodeMap of multiOwnedSubTrees) {

            //  First pass: build the multiOwned tree of join table paths.

            const nextMap = new Map();
            nextMap.atLeastOneNextIsJoinedFromOwnerToOwned = false;
            const multiOwnedTreeMapOb =  {                                              //  Top Node of the tree
                nextMap,
                joinedNode:{},                      //  Never accessed in later JOIN composing (level 0 is skipped)
                prev:null,                          //  Never accessed in later JOIN composing (level 0 is skipped)
            };

            //    Set(  'bs_j_cs', { Record, pathOfJoinedNodes,  ... }, )
            for (let [tblFullName, joinedNode] of joinedNodeMap){

                let prevNodeCandidate = multiOwnedTreeMapOb;                            //  Top Node of the tree

                // e.g. [ joinedNode:{tblFullName:'A'}, joinedNode:{tblFullName:'bs'}, joinedNode:{tblFullName:'bs_j'}, joinedNode:{tblFullName:'bs_j_cs'} ]
                for (let treeNodeCandidate of joinedNode.pathOfJoinedNodes) {                   //  An array.
                    const { tblFullName:pathNodeTblFullName, ownedFeedRecordParams } = treeNodeCandidate;

                    const {nextMap:prevNextMap} = prevNodeCandidate;       //  prevNodeCandidate !== Top Owner Table
                    if (ownedFeedRecordParams.joinedFromOwnerToOwned  &&  prevNodeCandidate.prev !== multiOwnedTreeMapOb) {
                        prevNextMap.atLeastOneNextIsJoinedFromOwnerToOwned = true;
                    }

                    let  treeNode = prevNextMap.get(pathNodeTblFullName);
                    if (!treeNode) {
                        const nextMap = new Map();
                        nextMap.atLeastOneNextIsJoinedFromOwnerToOwned = false;
                        treeNode = {
                            nextMap,
                            joinedNode:treeNodeCandidate,
                            prev: prevNodeCandidate,
                            isLast: pathNodeTblFullName === tblFullName,
                        };
                        prevNextMap.set(pathNodeTblFullName, treeNode);
                    }
                    prevNodeCandidate = treeNode;
                }
            }


            // Second pass : build the JOINs from the multiOwnedTreeMapOb

            const joins = [' '];
            const finalJoinConditions = [];

            let buildJoins = (/*treeNode*/) => {};      //  place holder allowing recursion
                buildJoins = (  treeNode  ) => {
                    const { nextMap } = treeNode;
                    if (nextMap.size) {

                        for (let [pathNodeTblFullName, subTreeNode] of nextMap.entries()) {
                            const {
                                isLast,
                                joinedNode:{ownedFeedRecordParams:{joinedFromOwnerToOwned, colNameJoiningTo,
                                                colNameJoinedIn, Record:{TableName}, joiningColNameCanBeNull}},
                                nextMap:{atLeastOneNextIsJoinedFromOwnerToOwned},
                                prev:{

                                    joinedNode:prevJoinedNode,
                                    prev: {joinedNode:prevPrevJoinNode},
                                    nextMap: { atLeastOneNextIsJoinedFromOwnerToOwned:
                                               atLeastOnePrevNextIsJoinedFromOwnerToOwned } } } = subTreeNode;

                            const { ownedFeedRecordParams:{joinedFromOwnerToOwned:prevIsJoinedFromOwnerToOwned,
                                                           colNameJoiningTo:prevColNameJoiningTo},
                                    tblFullName:prevTblFullName } = prevJoinedNode;

                            if (isLast) {
                                //  Skip!   //  but then buildJoins(subTreeNode), with .nextMap.size === 0,
                            }               //                                      filling finalJoinConditions;
                            else if (joinedFromOwnerToOwned) {
                                if (atLeastOneNextIsJoinedFromOwnerToOwned) {                           //  Can't skip!
                                    joins.push(`${joiningColNameCanBeNull ? ' LEFT' : ''
                                                } JOIN \`${TableName}\` AS \`${pathNodeTblFullName
                                                }\` ON  \`${prevTblFullName}\`.\`${colNameJoiningTo
                                                }\` = \`${pathNodeTblFullName}\`.\`${colNameJoinedIn}\``);

                                }
                            //  else :  skip !
                            }
                            //  (joinedFromOwnedToOwner)
                            else if (prevIsJoinedFromOwnerToOwned  &&  ! atLeastOnePrevNextIsJoinedFromOwnerToOwned) {
                                                                                            //  fill previously skipped
                                joins.push(` JOIN \`${TableName}\` AS \`${pathNodeTblFullName
                                            }\` ON  \`${prevPrevJoinNode.tblFullName}\`.\`${prevColNameJoiningTo
                                            }\` = \`${pathNodeTblFullName}\`.\`${colNameJoiningTo}\``);
                            }
                            //  (joinedFromOwnedToOwner  &&  ! prevIsJoinedFromOwnerToOwned  ||  atLeastOnePrevNextIsJoinedFromOwnerToOwned)
                            else {
                                joins.push(` JOIN \`${TableName}\` AS \`${pathNodeTblFullName
                                            }\` ON  \`${prevTblFullName}\`.\`${colNameJoinedIn
                                            }\` = \`${pathNodeTblFullName}\`.\`${colNameJoiningTo}\``);
                            }

                            buildJoins(subTreeNode);
                        }
                    }
                    //  ! nextMap.size  :   terminal node : isMultiOwned
                    else {
                        const { joinedNode:{ownedFeedRecordParams:{Record:{TableName}, colNameJoiningTo, colNameJoinedIn}},
                                prev:{
                                    joinedNode:prevJoinedNode,
                                    prev: {joinedNode:prevPrevJoinedNode},
                                    nextMap:{atLeastOneNextIsJoinedFromOwnerToOwned:
                                             atLeastOnePrevNextIsJoinedFromOwnerToOwned},},} = treeNode;

                        const { ownedFeedRecordParams:{joinedFromOwnerToOwned:prevIsJoinedFromOwnerToOwned,
                                                       colNameJoiningTo:prevColNameJoiningTo},
                                tblFullName:prevTblFullName } = prevJoinedNode;

                        if ( prevIsJoinedFromOwnerToOwned  &&  ! atLeastOnePrevNextIsJoinedFromOwnerToOwned ) {
                                                                                            //  fill previously skipped
                            finalJoinConditions.push(`\`${prevPrevJoinedNode.tblFullName}\`.\`${prevColNameJoiningTo
                                                     }\` = \`${TableName}\`.\`${colNameJoiningTo}\``);
                        }
                    //  if ( ! prevIsJoinedFromOwnerToOwned  ||  atLeastOnePrevNextIsJoinedFromOwnerToOwned )
                        else {
                            finalJoinConditions.push(`\`${prevTblFullName}\`.\`${colNameJoinedIn
                                                        }\` = \`${TableName}\`.\`${colNameJoiningTo}\``);
                        }
                    }
                };

            let treeNode = multiOwnedTreeMapOb.nextMap.get(tableName);
            buildJoins(treeNode);

            joins.push(`WHERE  ${finalJoinConditions.join('  OR  ')}`);
            joinedNodeMap.joins = joins;
        }

        //endregion

        //region _SqlSelectFcn(), _SqlSelect

        This._SqlSelectFcn = (tblPrefix='', sqlSelects=[`\`${tableName}\`.*`]) => {
            for (let { UniOwnedFeedRecord, ownerPropertyName, } of uniOwnedRecords) {
                const fullPropertyName = tblPrefix + ownerPropertyName;
                sqlSelects.push(`\`${fullPropertyName}\`.*`);   //  e.g. '`selfContact`.*'
                                        //  e.g. 'selfContact_', to make 'selfContact_address' next
                UniOwnedFeedRecord._SqlSelectFcn(nextTblPrefix(fullPropertyName), sqlSelects);
            }
            //  The  e.g. '`primaryPractitioner`.`feed_item_id`'  is not strictly necessary, just
            //  'primaryPractitioner__feed_item_id_hex' could do, but _BuildWithUniJoinedFromRow()
            //  algo requires a row subTable to attach it so we add a minimal referenced row subTable.
            for (let referencedRecord of referencedRecords) {
                const fullPropertyName = tblPrefix + referencedRecord.referencePropertyName;
                sqlSelects.push(`\`${fullPropertyName}\`.\`${referencedRecord.referenceIdColName}\``);
            }            //  e.g. '`primaryPractitioner`.`feed_item_id`'
            return sqlSelects;
        };

        const sqlSelects = This._SqlSelectFcn();
        const sqlSelect = sqlSelects.join(', ') + shaAndUuidSelects.join('');
        Object.defineProperty(This, '_SqlSelect', {value: sqlSelect});

        //endregion

        //region _SqlFromFcn(), _SqlFrom, _MultiSqlSelectFroms

        This._SqlFromFcn = (tblName=tableName, tblPrefix='', sqlFroms=[`\`${tableName}\``]) => {
            for (let { UniOwnedFeedRecord, propertyName, joinedFromOwnerToOwned,
                        colNameJoiningTo, colNameJoinedIn, joiningColNameCanBeNull } of uniOwnedRecords) {
                const fullPropertyName = tblPrefix + propertyName;
                sqlFroms.push(
                                `${joiningColNameCanBeNull ? 'LEFT ' : '     '
                                }JOIN \`${UniOwnedFeedRecord.TableName}\` AS \`${fullPropertyName
                                }\` ON  ${joinedFromOwnerToOwned  ?  `\`${tblName}\`.\`${colNameJoiningTo}\` = \`${
                                                                        fullPropertyName}\`.\`${colNameJoinedIn}\``
                                                                  :  `\`${fullPropertyName}\`.\`${colNameJoiningTo
                                                                        }\` = \`${tblName}\`.\`${colNameJoinedIn}\``  }`

                ); //  e.g. '  [LEFT ]JOIN `Contact` AS `selfContact` ON `Patient`.`self_contact_id` = `selfContact`.`id`'

                UniOwnedFeedRecord._SqlFromFcn(fullPropertyName, nextTblPrefix(fullPropertyName), sqlFroms);
            }
            for (let { ReferencedFeedItemRecord, referencePropertyName, joiningColNameCanBeNull,
                       colNameJoiningToReferenced, colNameJoinedInReferenced, } of referencedRecords) {
                referencePropertyName = tblPrefix + referencePropertyName;
                sqlFroms.push(
                                `${joiningColNameCanBeNull ? 'LEFT ' : '     '
                                }JOIN \`${ReferencedFeedItemRecord.TableName}\` AS \`${referencePropertyName
                                }\` ON  \`${tblName}\`.\`${colNameJoiningToReferenced}\` = \`${
                                referencePropertyName}\`.\`${colNameJoinedInReferenced}\``
                ); //  e.g. '  [LEFT ]JOIN `Practitioner` AS `primaryPractitioner` ON `Patient`.`primary_practitioner_id` = `primaryPractitioner`.`id`'
            }
            return sqlFroms;
        };

        const sqlFroms = This._SqlFromFcn();
        Object.defineProperty(This, '_SqlFrom', {value:sqlFroms.join('\n  ')});

        const selectFrom = (select, from) =>
                                             `SELECT ${select}\n  FROM ${from}\n `;

        //  e.g. SELECT `MultiAddress`.*
        //         FROM `MultiAddress`
        //        WHERE EXISTS (
        //            SELECT 1
        //              FROM ( SELECT * FROM `Patient`
        //                      WHERE Patient.first_name = ?) AS `Patient`
        //             WHERE  `Patient`.`self_contact_id` = `MultiAddress`.`contact_id`  OR  `Patient`.`emergency_contact_id` = `MultiAddress`.`contact_id`
        //        )

        const multiSqlSelectFroms = multiOwnedSubTrees.reduce(
                    (map, {joins, OwnerTblName, ownedFeedRecordParams:{Record, colNameJoiningTo, propertyName}}) =>

                            map.set(Record, {                                               //  map.set() returns map !
                                OwnerTblName, colNameJoiningTo, propertyName,
                                sqlSelectFrom: criteriaString => selectFrom(Record._SqlSelect, Record._SqlFrom) +
                                                       `WHERE EXISTS (`+
                                                    `\n     SELECT 1`   +
                                                    `\n       FROM ( SELECT \`${tableName}\`.* FROM \`${tableName}\``+
                                                    `\n               ${criteriaString.replace(/\n/g,
                                                    '\n               ')} ) AS \`${tableName}\``+
                                                    joins.join('\n      ') +
                                                    `\n )`,
                            }),
        /*  initial  map:*/new Map([[This, {sqlSelectFrom: criteriaString =>    //  Top Owner .sqlSelectFrom()
                                                                            selectFrom(This._SqlSelect, This._SqlFrom)
                                                                            +criteriaString.replace(/\n/g, '\n ')}],]));

        Object.defineProperty(This, '_MultiSqlSelectFroms', {value:  multiSqlSelectFroms});

        //endregion

        //region _UniJoinedFetchDemuxerFcn(), multiTableFetchDemuxers, _BuildWithUniJoinedFromRow()

        This._UniJoinedFetchDemuxerFcn = (tblPrefix='', level=1, ownUniJoinedTblFullAndPropertyNames=[],
                                          demuxers=[{                          // level 0 demuxerByTblFullName
                                               [tableName]: {
                                                    Record: This,
                                                    shaAndUuidNames: Array.from(zip(shaAndUuidNames,shaAndUuidNames)),
                                                    uniJoinedTblFullAndPropertyNames:ownUniJoinedTblFullAndPropertyNames
                                                },
                                          }]                                                                   ) => {
            //  Only one levelDemuxer per level, so instantiate and assign it to demuxers only if doesn't exist yet,
            let levelDemuxerByTblFullName = demuxers[level];            //  else, use the one previously allocated.
            if (!levelDemuxerByTblFullName) {
                demuxers[level] = levelDemuxerByTblFullName = {};
            }
            for (let {UniOwnedFeedRecord, ownerPropertyName} of uniOwnedRecords) {
                const uniOwnedTblFullName = tblPrefix + ownerPropertyName;
                ownUniJoinedTblFullAndPropertyNames.push({ uniJoinedTblFullName  : uniOwnedTblFullName,
                                                           uniJoinedPropertyName : ownerPropertyName    });

                const uniJoinedTblFullAndPropertyNames = [];
                UniOwnedFeedRecord._UniJoinedFetchDemuxerFcn(nextTblPrefix(uniOwnedTblFullName), level+1,
                                                              uniJoinedTblFullAndPropertyNames, demuxers);

                levelDemuxerByTblFullName [uniOwnedTblFullName] = {
                    Record: UniOwnedFeedRecord,
                    shaAndUuidNames: Array.from(zip(UniOwnedFeedRecord._ShaAndUuidNamesFnc(uniOwnedTblFullName),
                                                    UniOwnedFeedRecord._ShaAndUuidNames)),
                    uniJoinedTblFullAndPropertyNames,
                };//uniJoinedTblFullAndPropertyNames  is used in _BuildWithUniJoinedFromRow() to qualify .Record :
            }     //                                 === null  ?  ReferencedFeedItemRecord  :  UniOwnedFeedRecord
            for (let {ReferencedFeedItemRecord, referencePropertyName, referenceIdPropertyName,} of referencedRecords) {
                const referencedTblFullName = tblPrefix + referencePropertyName;
                ownUniJoinedTblFullAndPropertyNames.push({ uniJoinedTblFullName  : referencedTblFullName,
                                                           uniJoinedPropertyName : referenceIdPropertyName  });

                const uuidFields = [ ReferencedFeedItemRecord._uuidField ]; //  e.g. [ {colName:'feed_item_id', ...} ]

                levelDemuxerByTblFullName [referencedTblFullName] = {
                    Record: ReferencedFeedItemRecord,
                            //  e.g. [ 'primaryPractitioner__feed_item_id_hex', 'Practitioner__feed_item_id_hex' ]
                    shaAndUuidNames: Array.from(zip(shaAndUuidNamesFnc(uuidFields, referencedTblFullName),
                                                    shaAndUuidNamesFnc(uuidFields, ReferencedFeedItemRecord.TableName))),
                    uniJoinedTblFullAndPropertyNames: null,      //  HACK :
                };//uniJoinedTblFullAndPropertyNames  is used in _BuildWithUniJoinedFromRow() to qualify .Record :
            }     //                              === null  ?  ReferencedFeedItemRecord  :  UniOwnedFeedRecord
            return demuxers;
        };

        //  the demuxer array is .reverse()d, so the feedRecords are BuildFromRow() from deepest to top level.
        const multiTableFetchDemuxers = (demuxers => {
                                            //  if the deepest levelDemuxerByTblFullName is empty, remove it.
                                            if ( ! Object.keys(demuxers[demuxers.length - 1]).length ) {
                                                demuxers.pop();
                                            }
                                            return demuxers.reverse();
                                        })(This._UniJoinedFetchDemuxerFcn());

        const _BuildWithUniJoinedFromRow = (row, mapRecord=r=>r) => {  //  uniJoined = uniOwned + referenced (eventually)

            //  on connection.query({sql, nestTables:true}), mysql module puts the table-less sha and uuid, in row['']
            const shaAndUuidMapOb = row[''];                                    //  undefined if there's no sha or uuid
            //  used to store records or uuids by tblFullName between levels: assigned at level n+1, used at level n.
            const recordOrUuidByTblFullName = {};

            //  the demuxer array was .reversed() so the feedRecords .BuildFromRow() are done from deepest to top level.
            for (let levelFeedRecordsByTblFullName of multiTableFetchDemuxers) {
                for (let [tblFullName, {Record, shaAndUuidNames, uniJoinedTblFullAndPropertyNames}]
                                                                    of Object.entries(levelFeedRecordsByTblFullName)) {
                    const rowTable = row[tblFullName];
                            //  e.g.  null === row.selfContact.id is returned by LEFT JOIN, if Patient.self_contact_id is NULL
                    if (rowTable  &&  null !== rowTable[Record.idDbName]) {                 //  Skip null LEFT JOIN

                        //  First, distribute the Uuid and Sha from row[''] to their respective tables
                        for (let [shaOrUuidFullName, shaOrUuidName] of shaAndUuidNames) {
                            if (shaAndUuidMapOb) {                              //  undefined if there's no sha or uuid
                                rowTable[shaOrUuidName] = shaAndUuidMapOb[shaOrUuidFullName];
                            }
                        }

                        //  HACK
                        //       null === uniOwnedTblFullAndPropertyNames  ?  ReferenceFeedItemRecord
                        //                                                 :  UniOwnedFeedRecord

                        if ( null !== uniJoinedTblFullAndPropertyNames ) {        //  UniOwnedFeedRecord
                            //  Then, Build the Record from row subTable, (including the sha and uuid in hex);
                            const uniJoinedRecordMapOb = {};
                            //  Collect owned records builtFromRow / referenced uuids assigned, at the previous deeper level
                            for (let {uniJoinedTblFullName, uniJoinedPropertyName} of uniJoinedTblFullAndPropertyNames) {
                                //    uniJoinedTblFullName : either uniOwnedTblFullName or referencedTblFullName
                                //    uniJoinedPropertyName: either ownerPropertyName or referencePropertyName
                                uniJoinedRecordMapOb[uniJoinedPropertyName] = recordOrUuidByTblFullName[uniJoinedTblFullName]
                            }

                            const record = Record.BuildFromRow(rowTable);
                            if (Record._MultiOwnedFeedRecordsParams.length) {   //  a owner of multiOwnedFeedRecord ?
                                mapRecord(record);                                          //  map for future demux
                            }
                            //todo TEMPORARY KLUDGE !!!! decide how to pass uniJoinedRecordMapOb to both .BuildFromRow() here but also super.Insert()
                            recordOrUuidByTblFullName[tblFullName] = Object.defineProperty(record,
                                                    '_uniJoinedRecordMapOb', {value:uniJoinedRecordMapOb});
                        }
                        else {                                                              //  ReferenceFeedItemRecord
                                    //  One of those just written as rowTable[shaOrUuidName], above.
                            recordOrUuidByTblFullName[tblFullName] = rowTable[Record._uuidFullName]
                        }// It will be transferred to uniJoinedRecordMapOb[ownerPropertyName] as the next level is run.
                    }
                }
            }
            return recordOrUuidByTblFullName[tableName];  //  return the record builtFromRow at level 0.
        };

        This._FetchAndBuild =  (   /*  if  */   sqlSelects.length > 1                                       ?
                                                                        //  Only need to demux fetched records by
            async (sql, criteriaList, _fetchFromDb, mapRecord=r=>r) =>  //  table if there's more than one in Select.
                (await  _fetchFromDb({sql, nestTables: true}, criteriaList)).map(      row =>
                                                            _BuildWithUniJoinedFromRow(row, mapRecord))     :

                                /* else if */   multiOwnedRecords.length                                    ?

            async (sql, criteriaList, _fetchFromDb, mapRecord=r=>r) =>  //  Only need to map records if there's
                (await  _fetchFromDb(sql, criteriaList)).map(row =>     //  more than one multiOwnedRecord.
                                                                    mapRecord(This.BuildFromRow(row)))      :
                                /* else    */
            async (sql, criteriaList, _fetchFromDb) =>
                (await  _fetchFromDb(sql, criteriaList)).map(row =>
                                                                              This.BuildFromRow(row))       );

        //endregion

        //endregion

        //region  .Insert() helpers: _ColumnsToInsert, _GetValuesToInsert, _InsertedSrcObToRow, _ExtractJoinedFromSrcOb.

        //  Cache an array of only the column names, for each of the entries to INSERT.
        //  e.g. takes [ {colName:'mother_id'}, {colName:'gender'}, { colName:'age'}, ]  and build array :
        //             [          'mother_id',           'gender',            'age',  ]
        const insertedColNames = allInsertable.map(({colName}) => colName);

        //  Cache the max colName.length, for all the entries to INSERT
        //  e.g. takes [ 'mother_id', 'gender', 'age' ] and cache 9
        const maxInsertColNameLength = allInsertable.reduce(
                                                        (max, {colName:{length}})  =>
                                                                                       length > max  ?  length  :  max,
                                    /* initial value of  max:*/ 0);

        Object.defineProperty(This, '_ColumnsToInsert', {value:
            //  e.g. takes [ 'mother_id', 'gender', 'age', ]  and build string : (
            //        'mother_id = ?' +
            //  '\n    gender    = ?' +
            //  '\n    age       = ?')

                insertedColNames.map(colName => '`' + colName + '`'
                                                    + ' '.repeat(maxInsertColNameLength - colName.length)
                                                    + assignStrByColName.get(colName)               ).join(',\n    ')
        });

        //  Cache an array of only the recToCol arrow functions, for each of the entries to INSERT.
        //  e.g. takes [ {recToCol:({motherId})=>motherId}, {recToCol:({eGender})=>`${eGender}`}, {recToCol:({age=null})=>age}, ]  and build array :
        //             [           ({motherId})=>motherId,            ({eGender})=>`${eGender}`,            ({age=null})=>age,  ]
        const insertedRecToCols = allInsertable.map(({recToCol}) => recToCol);

        //  That's a double closure extracting from a srcOb argument the array of all the value to INSERT,
        //  in the appropriate type for the column.
        //  e.g. an arrow function taking argument srcOb : {  motherId,    eGender  }       and building array :
        //                                                 [  motherId, `${eGender}`,  null  ]
        Object.defineProperty(This, '_GetValuesToInsert', {value:
                (srcOb, validationErrors=[]) => insertedRecToCols.map(
                                                                        recToCol => {
                        try {
                            return recToCol(srcOb)
                        }
                        catch (e) {
                            if (e.isExpected) {                         //  validation error stops here!
                                validationErrors.push(e);               //  collecting them all for central handling
                            }
                        }
                    }
                )                                                                           });

        const isJoinedPropertyNameMultiOwned = Array.from(allJoinedMapByPropertyName.values()).map(
                                                    ({propertyName, isMultiOwned})  =>
                                                                                        [propertyName, isMultiOwned]);
        //  .Insert() helper function.
        //  The joined srcObs are not _really_ extracted, the goal is to tell Insert() that at least one
        //  joined srcOb (a referencedFeedItemId, a uniOwned srcOb, or a non empty multiOwned srcOb[]) is
        //  present in srcOb, so it's worth for Insert to go the complex path of running a transaction.
        //  If at least one joinedSrcOb is found, return srcOb :
        //      .Insert() will start a transaction and pick + validate all the individual joinedSrcOb from srcOb.
        //  Else return undefined:
        //      .Insert() will not start a transaction, just ._Insert() the simple srcOb row.
        This._ExtractJoinedFromSrcOb = srcOb => {
            for (let [propertyName, isMultiOwned] of isJoinedPropertyNameMultiOwned) {
                const joinedSrcOb =  srcOb[propertyName];           //  maybe a referencedFeedItemId, a uniOwned srcOb,
                if ( joinedSrcOb  &&  ( ! isMultiOwned  ||  joinedSrcOb.length)) {      //   or a multiOwned srcOb[]
                    return srcOb;   //  if srcOb[propertyName] isMultiOwned, it must be non-empty to return srcOb.
                }
            }
        //  return undefined;       // when none of the propertyName are defined in srcOb (or are non empty array)
        };

        //  That's a closure iterating through insertedColNames and insertedValues at the same time, using the
        //  currentIndex provided by reduce(), and adding to initialOb argument properties with these names and values.
        //  So e.g.,  with insertedColNames :  [ 'mother_id', 'gender', 'age', ]
        //
        //                              // insertedValues as built above from srcOb: { motherId,    eGender })
        //  (initialRow={ id, row_version, row_created, row_persisted }, insertedValues=[ motherId, `${eGender}`, null ]
        //
        //  )    =>     { id, row_version, row_created, row_persisted, mother_id:motherId, gender:`${eGender}`, age:null }

        const row_retiredNullOrUndefined =  hasRowRetiredField  ?  null  :  undefined;

        //  todo: Maybe change this for already existing GetById(), in which case: remove the undefined-filtering from This._FixShaAndUuidOfRow() as this is the only code passing it undefined uuid_hex/sha_hex
        This._InsertedSrcObToRow = async function(id, insertedValues, _fetchFromDb=fetchFromDb) {
                const initialRow = await This._GetCurrentRowPersistedAndVersion(id, _fetchFromDb);  // row_persisted__row_version
                initialRow.id = id;
                initialRow.row_created = initialRow.row_persisted;
                //  undefined is passed to base FeedRecord constructor exactly as if it's... undefined
                initialRow.row_retired = row_retiredNullOrUndefined;

                return insertedColNames.reduce(
                                                (resultingRow, colName, currentIndex) => {
                                                                resultingRow[colName] = insertedValues[currentIndex];
                                                                return resultingRow;
                                                },
                            /* initial value of  resultingRow:*/ initialRow );
        };

        //endregion

        //  region .toRowLitOb(), .toOwnerApiLitOb(), an other litObs...

        //  Enforcing above definition: toOwnerApiLitOb() { return this.toApiLitOb(); }
        if ( thisProto.toOwnerApiLitOb === FeedRecord.prototype.toOwnerApiLitOb) {  //  not been overridden
            thisProto.toOwnerApiLitOb = thisProto.toApiLitOb;
        }

        if ( ! allJoinedMapByPropertyName.size ) {  //  no referenced, uniOwned or multiOwned whatsoever : skip !
            This._AddJoinedFromApiLitOb = function _AddJoinedFromApiLitOb(apiLitOb, nativeLitOb){
                                                                                                  return nativeLitOb; };
            thisProto._addJoinedToApiLitOb = function _addJoinedToApiLitOb(apiLitOb) {
                                                                                        return apiLitOb; };
        }
        else {
            //  cache them in This and thisProto, not for performance :
            //  to override above straight-thru setting from a super with no joined along the prototype chain.
            This._AddJoinedFromApiLitOb = FeedRecord._AddJoinedFromApiLitOb;
            thisProto._addJoinedToApiLitOb = FeedRecord.prototype._addJoinedToApiLitOb;
        }

        //  Cache an array of only the column and _column names, for each of the entries to INSERT.
        //  i.e. it doesn't include: { id, row_version, _row_created, row_persisted, /*and maybe*/ row_retired, }
        //  e.g. takes [ {colName:'gender', _colName:'gender' }, { colName:'age', _colName:'_age' }, ] and build array :
        //             [         ['gender', 'gender],                     ['age', '_age' ]           ]
        const insertedGetColNames = allInsertable.map(({colName, get}) => [colName, get]);

        //  Fill a literal object with all the colName:value of a FeedRecord for .toRowJSON() export purpose.
        thisProto.toRowLitOb = function() {
            const { id, row_version, row_created, row_persisted, row_retired } = this;
            return insertedGetColNames.reduce(
                                                (litOb, [colName, get]) => {
                                                        litOb[colName] = get.call(this);
                                                        return litOb;
                                                },
                            /* initial value of  litOb:*/ { id, row_version, row_created, row_persisted, row_retired });
        };

        //endregion

        //region .update() helpers :

        //  Update is a multi steps process.
        //
        //  First, Build a FeedRecord from a pseudo row of "original" values.
        //  Then, apply the update "candidate" values, via the setter property of the fields meant to be updated.
        //  ValidateNMorph(value) are performed with both the "original" and "candidate" values submitted for update.
        //  Then, run the .update() dao itself, which handles any potential version mismatch, rejecting update
        //  for any "original" values not matching currently persisted values (akin to a git merge conflict),
        //  but also handling concurrent read-modify-writes integrity, using row_version based optimistic locking.
        //
        //  The process is extended trough any Owned FeedRecords.
        //  It uses the help of a OwnedRecordUpdatePlanner, in charge of planning the update, add and
        //  delete of Owned FeedRecords, often a best effort situation when lacking the id/rowVersion
        //  of the Owned sub FeedRecords, bundled into arrays of a Owner FeedRecord (passed around in
        //  JSON/LitOb form).

        //region getter / setter / add()

        //  Add the getter and setter for all the fields that can be updated.  (see recVsCol() above for get, set def ).

        for (let {colName, recName, get, set } of allUpdatInsertable) {
            //  The .whateverId recName getter setter are NOT defined, for which .whatever_id
            //  colName is the .colNameJoiningToOwned of a UniOwnedFeedRecord params or is the
            //  .colNameJoiningToReferenced of a UniOwnedFeedRecord params. Instead, those have a
            //  .whatever getter returning FeedRecord/FeedRecord.feedItemId|undefined and a
            //  .addWhatever(FeedRecord) conditional pseudo-setter, which only sets .whatever_id
            //  if it's still NULL.
            if ( ! uniJoinedColNameSet.has(colName) ) {
                Object.defineProperty(thisProto, recName, { configurable:true, enumerable:true, get, set });
            }
        }

        //  Add the getter for the uniOwnedRecords .ownerPropertyName   e.g. patientRecord .selfContact, .emergencyContact, ...
        for (let { ownerPropertyName, } of uniOwnedRecords) {
            Object.defineProperty(thisProto, ownerPropertyName, { configurable:true, enumerable:true,
                //todo TEMPORARY KLUDGE !!!! decide how to pass uniJoinedRecordMapOb to both super.Insert() here but also .Get*()
                get() {
                    return this._uniJoinedRecordMapOb[ownerPropertyName];
                }});
        }
        //  for update(), to come:
        //todo Add the adder for the uniOwnedRecords, i.e. a setter only if current value is NULL,  e.g. patientRecord .addSelfContact, .addEmergencyContact, .addBirthPlace, ...
        for (let { ownerPropertyName, } of uniOwnedRecords) {
            thisProto['add'+capitalizeName(ownerPropertyName)] = function(joinedFeedRecord) {
                //todo complete the conditional adder, updating .whatever_id from whatever ownedFeedRecord argument only if it is still NULL
            };
        }

        //  Add the getter / setter for the referencedRecords .referenceIdPropertyName   e.g. patientRecord .primaryFeedPractitionerId, ...
        for (let { referenceIdPropertyName } of referencedRecords) {
            Object.defineProperty(thisProto, referenceIdPropertyName, { configurable:true, enumerable:true,
                //todo TEMPORARY KLUDGE !!!! decide how to pass uniJoinedRecordMapOb to both super.Insert() here but also .Get*()
                get() {
                    return this._uniJoinedRecordMapOb[referenceIdPropertyName];
                }});                    //  e.g.   ['primaryFeedPractitionerId']
        }
        //  for update(), to come:
        //todo Add the changer for the referencedIdRecords,  e.g. patientRecord .changePrimaryPractitioner|changePrimaryFeedPractitionerId, ...

        // for (let { referenceIdPropertyName, referencePropertyName, referenceIdColName } of referencedRecords) {
        //     //  do it by FeedItemRecord or FeedItemRecordUuid argument ? (async in the later case, to fetch FeedRecord)
        //     //  not only-if-NULL like it's the case uniOwnedRecord, so change, not add.
        //     thisProto['change'+capitalizeName(referencePropertyName)] = function(joinedFeedRecord) {
        //         return this._uniJoinedRecordMapOb[referencePropertyName][referenceIdColName];
        //     //todo complete the conditional adder, updating .whatever_id from whatever ownedFeedRecord argument only if it is still NULL
        //     };
        // }

        //endregion

        //  Cache an array of only the column and _column names, for each of the entries to UPDATE.
        //  e.g. takes [ {colName:'gender', _colName:'gender' }, { colName:'age', _colName:'_age' }, ] and build array :
        //             [         ['gender', 'gender],                     ['age', '_age' ]           ]

        // const updating_ColNames = allUpdatInsertable.map(({colName, _colName}) => [colName, _colName]);

        const updating_ColNameMap = allUpdatInsertable.reduce(
                                        (map, {colName, _colName})  =>      //  map.set() returns map !
                                                                        map.set(colName, _colName),
                       /* initial empty  map:*/ new Map() );

        //  Assign value properties from a row or rowPart, but using _colName to assign the value on the FeedRecord.
        //  This allows to support the update mechanism when a field .rowName and .recName are the same. (see above)
        //  Meant to be used in constructor() :
        //      Note the "Own" in the name: each constructor along the prototype chain takes care of the fields it owns.
            //todo Implement all of the following NOTE for .update()
        //  NOTE
        //          .whatever_id schema used as _UniOwnedFeedRecordsParams .colNameJoiningToOwned specifies
        //              either NOT NULL or DEFAULT NULL :
        //           - if NOT NULL, the uniOwned FeedRecord MUST be there at INSERT and .whatever_id is never
        //              further changed;
        //           - if DEFAULT NULL, the uniOwned FeedRecord CAN be there at INSERT, in which case
        //              .whatever_id is never further changed, or be added later as part of an .update(), in
        //              which case .whatever_id is changed from NULL to non-NULL and never further changed.
        //              It is anticipated that neither .whateverId getter nor setter be provided, but instead,
        //              a .whatever getter returning a FeedRecord (or undefined if .whatever_id is NULL), and
        //              if the .whatever_id schema specifies DEFAULT NULL, a .addWhatever(feedRecord) of
        //              sort for usage by further .update().
        //              It is anticipated that these rules will be enforced by inspection of DB schema
        //              [NOT|DEFAULT] NULL, ._UniOwnedFeedRecordsParams, and maybe ._FieldsToOnlyInsert and
        //              ._FieldsToInsertAndUpdate, in which case, it is anticipated that .whatever_id MUST
        //              be included in ._FieldsToOnlyInsert if its schema specifies NOT NULL, and MUST be
        //              included in ._FieldsToInsertAndUpdate  if its schema specifies DEFAULT NULL.
        thisProto._setMostRecentKnownPersistedRowOwnUpdatableValues = function(rowPart) {
            for (let[colName, value] of Object.entries(rowPart)) {
                this[updating_ColNameMap.get(colName)] = value;
            }
        };

        //  Kinda the reciprocal of ._setMostRecentKnownPersistedRowOwnUpdatableValues(), but with colName in argument
        thisProto._previousKnownPersistedRowUpdatableValue = function(colName) {
            return this[updating_ColNameMap.get(colName)];
        };

        Object.defineProperty(thisProto, '_columnsAndValuesToUpdate', { get() {
                //  By basing _columnsAndValuesToUpdate on this.#toUpdate, no specific
                //  field order is expected: it will be different from update to update.

                //  As this is recomputed live on each update (but only once per update,
                //  regardless of the number of bad-row_version-induced retries), don't bother
                //  padding to maxUpdateColNameLength or doing any but required formatting.

                const entries = Object.entries(this.#toUpdate);                 //  [ [colName, candidateValue], ... ]
                if (entries.length) {                                                   //  at least 1 entry in mapOb

                    const toUpdate = entries.values();                                      //  get mapOb iterator.
                    let { done, value:[colName, candidateValue] } = toUpdate.next();        //  get 1st entry from mapOb
                                                                                            //      guaranteed present
                    //        no ' = ?, ' colName prefix for 1st entry
                    let columnsToUpdate = '`'+colName, candidateValues = [ candidateValue ];//  1st entry added freely
                    let assignStr = assignStrByColName.get(colName);

                    ({ done, value:[colName, candidateValue] } = toUpdate.next());  //  add > 1st entry only if ! done
                    while ( ! done ) {
                        columnsToUpdate += ( '`' + assignStr + ', `' + colName );
                        candidateValues.push(candidateValue);
                        assignStr = assignStrByColName.get(colName);

                        ({ done, value:[colName, candidateValue] } = toUpdate.next());
                    }
                    return [ columnsToUpdate + '`' + assignStr, candidateValues ];  //  add final ' = ?',   well,
                }                                                                   //  or ' = UUID_TO_BIN( ?, 1)', ...
                else return [ '', [] ];
            }});

        //  Cache a map of only the colName and recToCol arrow functions, by recName, for each of the entries to INSERT.
        //  e.g. takes [ {recName:'motherId',  colName:'mother_id', recToCol:({motherId})=>motherId}, {recName:'eGender',  colName:'gender', recToCol:({eGender})=>`${eGender}`}, {recName:'age',  colName:'age',recToCol:({age=null})=>age}, ]  and build Map :
        //             {         ['motherId']:{colName:'mother_id', recToCol:({motherId})=>motherId},         ['eGender']:{colName:'gender', recToCol:({eGender})=>`${eGender}`},         ['age']:{colName:'age',recToCol:({age=null})=>age}, }

        const updatingRecMap = feedRecordBaseUpdating.concat(  //  { id, rowVersion, rowPersisted }
                                                             allInsertable)
                                                     .reduce(
                             (map, {recName, colName, recToCol, set}) =>
                                                                    map.set(recName, {colName, recToCol, set}),
            /* initial empty  map:*/ new Map()              );  //  Hardcoded FeedRecord base fields relevant for update

        This._BuildFeedRecordFromOriginalSrcObToUpdate = function (originalSrcOb, originalRow={}, validationErrors=[]) {
            //  NOTE :
            //          since only This FeedRecord fields are part of insertedRecToColMap,
            //          the MultiOwned FeedRecord arrays won't be transferred to initialRow here.
            for (let recName of Object.keys(originalSrcOb))  {
                const colName_recToCol_set = updatingRecMap.get(recName);
                if (colName_recToCol_set) {                             //  validate recName as update candidate.
                    const { colName, recToCol } = colName_recToCol_set;
                    try {
                        originalRow[colName] = recToCol(originalSrcOb);             //  May throw Validation Error!
                    }
                    catch (e) {
                        if (e.isExpected) {                             //  validation error stops here!
                            validationErrors.push(e);                   //  collecting them all for central handling
                        }
                    }
                }
            //  else {
            //  //  NotForUpdate() added only once in ._applyUpdateCandidate() for both original and candidate values.
            //  }
            }
            return This.BuildFromRow(originalRow);
        };

        thisProto._applyUpdateCandidate = function(candidateSrcOb, validationErrors=[]) {
            //  NOTE :
            //          since only This FeedRecord own fields are part of updatingRecNameSet,
            //          the MultiOwned FeedRecord arrays won't be transferred to feedRecord here.
            for (let [recName, candidateValue] of Object.entries(candidateSrcOb))  {
                const colName_recToCol_set = updatingRecMap.get(recName);
                if (colName_recToCol_set) {                             //  validate recName as update candidate.
                    const { set } = colName_recToCol_set;
                    try {
                        set.call(this, candidateValue);                             //  May throw Validation Error!
                    }
                    catch (e) {
                        if (e.isExpected) {                             //  validation error stops here!
                            validationErrors.push(e);                   //  collecting them all for central handling
                        }
                    }
                }
                else {                              //  Do it only once here, for both original and candidate values.
                    validationErrors.push(NotForUpdate(`Update request for ${This.FeedItemName} .${recName} denied.`));
                }
            }
            return this;
        };

        //endregion

        return This;
    }

    //region The get/set "interface": {  id, rowVersion, rowCreated, rowPersisted, rowRetired, _sqlNotRetired, ... }

    get id() { return this.#id; }

    get row_version()   { return this.#row_version; }
    get rowVersion()   { return this.#row_version; }

    get row_created()   { return this.#row_created; }
    get rowCreated()   { return this.#row_created; }

    get row_persisted() { return this.#row_persisted; }
    get rowPersisted() { return this.#row_persisted; }

    //  .row_retired and .rowRetired getters are overridden with {value:undefined} in .Setup(), if DB Table has no row_retired column.
    get row_retired() { return this.#row_retired; }
    get rowRetired() { return this.#row_retired; }

    static get _sqlNotRetired() { return ` AND row_retired IS NULL`; } //  overridden with {value:''} in .Setup(), if DB Table has no row_retired column.
    get _sqlNotRetired() { throw Error(`${this.Name}.prototype.get _sqlNotRetired() : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region toApiLitOb() / toJSON() / FromApiLitOb()

    toRowLitOb() { throw Error(`${this.Name}.prototype.toRowLitOb() : Not defined yet. Run ${this.Name}.Setup().`); }

    toOwnLitOb() {                 //  Overridden without rowRetired in .Setup(), if DB Table has no row_retired column.
        const { id, rowVersion, rowCreated, rowPersisted, rowRetired, } = this;
        return {id, rowVersion, rowCreated, rowPersisted, rowRetired, };
    }
    _toSuperOwnLitOb() { return {}; }                                                   //  Final magic !   (part - 1)
    toFullOwnLitOb() { return { ...this._toSuperOwnLitOb(), ...this.toOwnLitOb()}; }    //  Final magic !   (part - 2)

    _addNativeJoinedToFullLitOb(fullLitOb) {
        //  e.g. {    :'selfContact' }
        for (let { ownerPropertyName } of this._UniOwnedFeedRecordsParams) {
            const ownerProperty = this[ownerPropertyName];
            if (ownerProperty) {
                fullLitOb[ownerPropertyName] =    ownerProperty.toNativeLitOb();
        // e.g. patientFullLitOb.selfContact = this.selfContact.toNativeLitOb();
            }
        }

        //  e.g. {           : 'legitIds' }
        for (let { ownerArrayPropertyName } of this._MultiOwnedFeedRecordsParams) {
            const ownerArrayProperty =       this[ownerArrayPropertyName];
            if (  ownerArrayProperty  ) {
                fullLitOb[ownerArrayPropertyName] = ownerArrayProperty.map(record => record.toNativeLitOb());
            //  e.g.    patientFullLitOb.legitIds = this.legitIds     .map(record => record.toNativeLitOb());
            }
        }

        //  e.g. { :'primaryFeedPractitionerId' }
        for (let {   referenceIdPropertyName    } of this._ReferencedFeedRecordsParams) {
            const referenceId = this[referenceIdPropertyName];
            if (referenceId) {
                fullLitOb[referenceIdPropertyName]                 =    referenceId;
                // e.g. patientFullLitOb.primaryFeedPractitionerId = this.primaryFeedPractitionerId;
            }
        }

        return fullLitOb
    }

    toNativeLitOb() { return this._addNativeJoinedToFullLitOb(this.toFullOwnLitOb()); }

    toRowJSON()    { return JSON.stringify(this.toRowLitOb()); }
    toOwnJSON()    { return JSON.stringify(this.toOwnLitOb()); }
    toFullOwnJSON(){ return JSON.stringify(this.toFullOwnLitOb()); }
    toNativeJSON() { return JSON.stringify(this.toNativeLitOb()); }
    toNativeNiceJSON() {   return niceJSON(this.toNativeLitOb()); }

    get native() { return { toJSON    : () => this.toNativeJSON(),
                            toApiLitOb: () => this.toNativeLitOb(),
                            toNiceJSON: () => this.toNativeNiceJSON(),  }; }


    static FromRetiredApiLitOb(rowRetired) {                                        //  Overridden in FeedRecordItem !
        return {
            rowRetired,
        }
    }
    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const { feedItemVersion, lastUpdated } = apiLitOb;
        return this._AddJoinedFromApiLitOb(apiLitOb, {
            rowPersisted: strToDate(lastUpdated),
            rowVersion  : feedItemVersion,
            ...nativeLitOb,
        });
    }
    static FromApiLitOb(apiLitOb) {
        const { retired } = apiLitOb;
        return  retired  ?  this.FromRetiredApiLitOb(retired, apiLitOb)  :  this.FromNonRetiredApiLitOb(apiLitOb);
    }

    //  translate from web std litOb to native
    static _AddJoinedFromApiLitOb(apiLitOb, nativeLitOb) {
        for (let {UniOwnedFeedRecord, ownerLitObName, ownerPropertyName} of this._UniOwnedFeedRecordsParams) {
            const ownedLitOb = apiLitOb[ownerLitObName];     //  e.g.    patientLitOb.selfContact => selfContactLitOb
            if (ownedLitOb) {      //  maybe null or undefined
                nativeLitOb[ownerPropertyName] = UniOwnedFeedRecord.FromOwnedApiLitOb(ownedLitOb);
            }//  e.g.  nativeLitOb.selfContact =            ContactRecord.FromOwnedApiLitOb(selfContactLitOb);
        }

        for (let {MultiOwnedFeedRecord, ownerLitObArrayName, ownerArrayPropertyName} of this._MultiOwnedFeedRecordsParams) {
            const ownerLitObArray = apiLitOb[ownerLitObArrayName];             //  e.g.    practitionerLitOb.practices
            if (  ownerLitObArray  &&  ownerLitObArray.length  ) {          //  maybe null or undefined, or empty!
                //  e.g.       nativeLitOb.legitIds = practitionerLitOb.practices.map(
                nativeLitOb[ownerArrayPropertyName] = ownerLitObArray.map(
                                            ownedLitOb => MultiOwnedFeedRecord.FromOwnedApiLitOb(ownedLitOb));
            }                    // e.g. practiceLitOb => PatientLegitIdRecord.FromOwnedApiLitOb(practiceLitOb));
        }

        //  e.g. { :'primaryFeedPractitionerId', :'primaryPractitionerFeedItemId' }
        for (let {         referenceIdLitObName, referenceIdPropertyName      } of this._ReferencedFeedRecordsParams) {
            const referenceId = apiLitOb[referenceIdLitObName];    //  e.g. patientLitOb.primaryFeedPractitionerId => referenceId
            if (referenceId) {
                nativeLitOb[referenceIdPropertyName] = referenceId;
                //  e.g. nativeLitOb.primaryPractitionerFeedItemId = patientLitOb.primaryFeedPractitionerId;
            }
        }

        return nativeLitOb;
    }

    //  translate from native to web std litOb
    _addJoinedToApiLitOb(apiLitOb) {
        //  e.g. { :'selfContact',   : 'selfContact' }
        for (let { ownerLitObName, ownerPropertyName } of this._UniOwnedFeedRecordsParams) {
            const ownerProperty = this[ownerPropertyName];
            if (ownerProperty) {
                apiLitOb[ownerLitObName] =    ownerProperty.toOwnerApiLitOb();
        // e.g. patientLitOb.selfContact = this.selfContact.toOwnerApiLitOb();
            }
        }

        //  e.g. {       : 'practices',           : 'legitIds' }
        for (let { ownerLitObArrayName, ownerArrayPropertyName } of this._MultiOwnedFeedRecordsParams) {
            const ownerArrayProperty =       this[ownerArrayPropertyName];
            if (  ownerArrayProperty  &&  ownerArrayProperty.length  ) {
                apiLitOb[ownerLitObArrayName] = ownerArrayProperty.map(record => record.toOwnerApiLitOb());
        //  e.g.  practitionerLitOb.practices = this.legitIds     .map(record => record.toOwnerApiLitOb());
            }
        }

        //  e.g. { :'primaryFeedPractitionerId', :'primaryFeedPractitionerId' }
        for (let {         referenceIdLitObName, referenceIdPropertyName      } of this._ReferencedFeedRecordsParams) {
            const referenceId = this[referenceIdPropertyName];
            if (referenceId) {
                apiLitOb[referenceIdLitObName] = referenceId;
                //  e.g. patientLitOb.primaryFeedPractitionerId = this.primaryFeedPractitionerId;
            }
        }

        return apiLitOb;
    }

    toRetiredApiLitOb(retired) {                                                    //  Overridden in FeedRecordItem !
        return {
            retired
        };
    }
    toNonRetiredApiLitOb(apiLitOb={}) {
        const { rowVersion:feedItemVersion, rowPersisted:lastUpdated } = this;
        return this._addJoinedToApiLitOb({
            lastUpdated,
            feedItemVersion,
            ...apiLitOb,
        });
    }
    toApiLitOb() {
        const { rowRetired } = this;
        return  rowRetired  ?  this.toRetiredApiLitOb(rowRetired)  :  this.toNonRetiredApiLitOb();
    }

    toNiceJSON()  {  return niceJSON(this.toApiLitOb()); }
    toJSON() { return JSON.stringify(this.toApiLitOb()); }

    //endregion

    /**
     *
     * @param {Object} row: the arguments to build an instance of the Record class, in 'some_id' row form.
     * @constructor
     */
    static BuildFromRow(row) {                                  //  'this' is the static This: the class constructor.
        return new this(this._FixShaAndUuidOfRow(row));
    }

    /**
     *
     * @param {Number|String}id
     * @param {String}idDbName
     * @param {Promise<object[]>}fetchPromise
     * @param {String}feedAlias
     * @returns {Promise<object>}
     */
    static async _FetchById(id, idDbName, fetchPromise, feedAlias=null) {
        return (rows => {
            if (rows.length) {
                return rows[0];
            }
            throw NoRow(`no ${this.FeedItemName} of ${idDbName} [${id}] ${
                                                    null===feedAlias ? '' : `feed_alias [${feedAlias}] `}found`, id);
        })(await fetchPromise);  //  'this' is the static This: the class, not the instance.
    }
    /**
     *
     * @param {Number|String} id
     * @param {String} idDbName
     * @param {Promise<object[]>}fetchPromise
     * @param {String}feedAlias
     * @returns {Promise<object>}
     */
    async _FetchById(id, idDbName, fetchPromise, feedAlias=null) { throw Error(`${this.Name}.prototype._FetchById(id=${id}, idDbName=${idDbName}, fetchPromise=${fetchPromise}, feedAlias=${feedAlias}) : Not defined yet. Run ${this.Name}.Setup().`);}

    /**
     *
     * @param {number} id
     * @param {function} _fetchFromDb
     * @returns {Promise<{row_persisted, row_version}>}
     */
    static async _GetCurrentRowPersistedAndVersion(id, _fetchFromDb=fetchFromDb) {
        //  NOTE :  In db, .row_persisted value is auto set to CURRENT_TIMESTAMP ON UPDATE,
        //          It is NOT read back after INSERT or UPDATE by default, for now, only shortly approximated in FeedRecord.
        return await this._FetchById(id, this.idDbName, _fetchFromDb((
                                'SELECT `row_version`, `row_persisted` FROM '+this.TableName+' WHERE `'+this.idDbName+'` = ?'),
                                //  get .row_persisted & .row_version from 1st and only row of rows/results
                                //      .row_persisted is a timestamp set to CURRENT_TIMESTAMP() ON UPDATE
                                [id]))
    }
    /**
     *
     * @param {number} id
     * @param {function} _fetchFromDb
     * @returns {Promise<{row_persisted, row_version}>}
     */
    async _GetCurrentRowPersistedAndVersion(id, _fetchFromDb=fetchFromDb) {
        throw Error(`${this.Name}.prototype._GetCurrentRowPersistedAndVersion(id=${id}, _fetchFromDb=${_fetchFromDb}) : Not defined yet. Run ${this.Name}.Setup().`);
    }

    async _refreshRowPersistedAndVersion(_fetchFromDb=fetchFromDb) {
        const row_persisted__row_version = await this._GetCurrentRowPersistedAndVersion(this.id, _fetchFromDb);

        this.#row_version = row_persisted__row_version.row_version;
        this.#row_persisted = row_persisted__row_version.row_persisted;
        return row_persisted__row_version;
    }

    static async _Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb}={}) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const {TableName, _ColumnsToInsert, } = This;
        const insertedValues = This._GetValuesToInsert(srcOb, validationErrors);

        if (validationErrors.length) {                                  //  Everybody checks validationErrors.length
            return { id:0 }                                             //  before really performing the _dbInsert()
        }

        const id = await _dbInsert(('INSERT INTO `' + TableName +
                                 '`\nSET '         + _ColumnsToInsert),     insertedValues);

        return This.BuildFromRow(
                await This._InsertedSrcObToRow(id, insertedValues, _fetchFromDb));
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}={}) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.

        const throwOnValidationErrors = () => {
            if (validationErrors.length) {
                throw Validation(`Inserting ${This.FeedItemName} :\n${validationErrors.join('\n')}`, validationErrors);
            }
        };

        const joinedSrcMapOb = This._ExtractJoinedFromSrcOb(srcOb);     //  returns either srcOb or undefined

        if (joinedSrcMapOb) {   //  If present, the joinedSrcItems have already been converted from joinedSrcLitOb.

            const insertWithJoinedSrcObs = async ({_dbInsert, _fetchFromDb, trans}) => {

                //  Used to collect all freshly inserted uniOwned and referenced FeedRecords of This.
                const uniJoinedRecordMapOb = {};

                for (let {UniOwnedFeedRecord, ownerPropertyName, recNameJoiningTo, colNameJoinedInOwned
                                                        } of This._UniOwnedFeedRecordsParams.JoinedFromOwnerToOwned) {

                    const uniOwnedSrcOb = joinedSrcMapOb[ownerPropertyName];   //  e.g.    joinedSrcMapOb.selfContact
                    if (uniOwnedSrcOb) {
                        const uniOwnedRecord = await UniOwnedFeedRecord.Insert({srcOb: uniOwnedSrcOb,
                                                                    validationErrors, _dbInsert, _fetchFromDb, trans});
                        uniJoinedRecordMapOb[ownerPropertyName] = uniOwnedRecord;
                        //  e.g.                ['selfContact'] =  contactRecord;

                        srcOb[recNameJoiningTo] = uniOwnedRecord[colNameJoinedInOwned]
                    } // patientSrcOb[self_contact_id] =  contactRecord['id'];
                }

                for (let { ReferencedFeedItemRecord, referenceIdPropertyName,
                           recNameJoiningTo } of This._ReferencedFeedRecordsParams.JoinedFromReferencerToReferenced) {
                                        //  e.g. joinedSrcMapOb.primaryFeedPractitionerId
                    const referencedFeedItemId = joinedSrcMapOb[referenceIdPropertyName];
                    if (referencedFeedItemId) {
                        const referencedRecordId = await ReferencedFeedItemRecord.GetIdByUuid(referencedFeedItemId,
                                                                    srcOb.feedAlias, validationErrors, _fetchFromDb);
                        if (  referencedRecordId  ) {                   //  referencedRecord[referenceIdColName];
                            uniJoinedRecordMapOb[referenceIdPropertyName] = referencedFeedItemId;
                            //  e.g.        ['primaryFeedPractitionerId'] = joinedSrcMapOb.primaryFeedPractitionerId;

                            srcOb[       recNameJoiningTo       ] = referencedRecordId
                        }// patientSrcOb[primary_practitioner_id] = PractitionerRecord['id'];
                    }
                }

                const record = await This._Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans});
                // const { id, } = record;
                //  if this._Insert() (or any other before it) failed on validation,
                //      record is { id:0 }, and validationErrors is non-empty.
                //      Continue with MultiOwnedFeedRecord.Insert() it will just perform validation no dbInsert().

                //todo TEMPORARY KLUDGE !!!! decide how to pass uniJoinedRecordMapOb to both super.Insert() here but also .Get*()
                Object.defineProperty(record, '_uniJoinedRecordMapOb', {value:uniJoinedRecordMapOb}); // TEMPORARY KLUDGE !!!!

                //  Continue to fill ._uniJoinedRecordMapOb with uniOwned JoinedFromOwnedToOwner

                for (let {UniOwnedFeedRecord, ownerPropertyName, recNameJoiningTo, colNameJoinedInOwner
                                                        } of This._UniOwnedFeedRecordsParams.JoinedFromOwnedToOwner) {

                    const uniOwnedSrcOb = joinedSrcMapOb[ownerPropertyName];   //  e.g.    joinedSrcMapOb.reachability
                    if (uniOwnedSrcOb) {
                    //  patientReachSrcOb[ patient_id ] = patientRecord['id'];
                        uniOwnedSrcOb[recNameJoiningTo] = record[colNameJoinedInOwner];

                        const uniOwnedRecord = await UniOwnedFeedRecord.Insert({srcOb: uniOwnedSrcOb,
                                                                    validationErrors, _dbInsert, _fetchFromDb, trans});
                        uniJoinedRecordMapOb[ownerPropertyName] = uniOwnedRecord;
                        //  e.g.               ['reachability'] = patientReachabilityRecord;
                    }
                }

                //  Finish to fill ._uniJoinedRecordMapOb with referenced JoinedFromReferencedToReferencer

                //  The reversed - referenced paradigm (with the foreignKey in the referenced
                //  FeedItemRecord) appears nowhere weirder than on Insert.
                //  As much as there are clear use cases for the reversed - uniOwned paradigm :
                //   - optional, or late coming, or third party extension, or app dependent
                //      extra uniOwned data;
                //   - very low volume extra data (not worth the 64b .whatever_id in all
                //      instance of owner);
                //
                //  as much as the case for the reversed - referenced appears thin and opportunistic :
                //   - there's already a reference to This in another FeedItemRecord that makes
                //      sense and This uses it opportunistically to show the reference link without
                //      the cost of adding (and maintaining) a reciprocal double of the .whateverId.
                //
                //  But in that use case, it really feels like the ownership/authorship of the link
                //  belongs to the referencer FeedItemRecord. And it seems inappropriate that an
                //  Insert of an instance of This with a referencedFeedItemId should cause that
                //  FeedItemRecord reference to This to be CHANGEd to the inserted instance of This.
                //  If This is really just being opportunistic, then such change should entirely be
                //  under the realm of the reversed - referenced FeedItemRecord.
                //
                //  Therefore, until this reasoning is proven wrong, it doesn't make sense for any
                //  reversed - referenced referencedFeedItemId to even be part of the .Insert() API.
                //  In which case, the
                //      for( of ._ReferencedFeedRecordsParams.JoinedFromReferencedToReferencer)
                //  is run to no avail in .Insert(), and can be skipped from the start.

                // for (let { referenceIdPropertyName, } of This._ReferencedFeedRecordsParams.JoinedFromReferencedToReferencer) {
                //                         //  e.g. joinedSrcMapOb.primaryFeedPractitionerId
                //     const referencedFeedItemId = joinedSrcMapOb[referenceIdPropertyName];   //  get the uuid, typically
                //     if (referencedFeedItemId) {
                //         uniJoinedRecordMapOb[referenceIdPropertyName] = referencedFeedItemId;
                //     }
                // }

                //  e.g. { : PatientLegitIdRecord,         : 'legitIds',    : 'patient_id',              : 'id', }
                for (let { MultiOwnedFeedRecord, ownerArrayPropertyName, recNameJoiningTo, colNameJoinedInOwner,
                                                                            } of This._MultiOwnedFeedRecordsParams) {
                    //  Typically, the srcOb and joinedSrcMapOb argument have been sorted by at least
                    //  hand-picking all ownProps and passing them as srcOb above (joinedSrcItems maybe the ..._rest).

                    //  e.g. legitIdSrcObs = joinedSrcMapOb.legitIds, for example
                    const multiOwnedSrcObs = joinedSrcMapOb[ownerArrayPropertyName];

                    if (multiOwnedSrcObs && multiOwnedSrcObs.length) {
                        //  e.g.           = practitionerRecord.legitIds  = [] after PractitionerRecord.Insert(), above.
                        const ownedRecords = validationErrors.length ? [] : record[ownerArrayPropertyName];
                        let seq = 1;

                        //  e.g.    legitIdSrcOb of practitionerLegitIdSrcObs
                        for (let multiOwnedSrcOb of multiOwnedSrcObs) {

                            //  e.g. legitIdSrcOb[patient_id] = patientRecord['id'];
                            multiOwnedSrcOb[recNameJoiningTo] = record[colNameJoinedInOwner];

                            //  NOTE    seq argument is only set to comply with any NOT NULL Db schema requirement,
                            //          seq value assignment at INSERT must entirely be handled by DB schema TRIGGER.
                            multiOwnedSrcOb.seq = seq++;

                            // .legitIds.push(
                            ownedRecords.push(
                                    //  e.g.  PatientLegitIdRecord.Insert({     :    legitIdSrcOb, ..});
                                        await MultiOwnedFeedRecord.Insert({srcOb: multiOwnedSrcOb,
                                                                    validationErrors, _dbInsert, _fetchFromDb, trans}));
                        }
                    }
                }

                return record;
            };

                            //  already in a transaction : continue with its received {_dbInsert, _fetchFromDb, trans}
            return trans ?  await insertWithJoinedSrcObs({_dbInsert, _fetchFromDb, trans})

                            //  not already in a transaction : start one!
                         :  await doInTransaction((
                                async trans => {
                                    const { transDbInsert, transFetchFromDb } = trans;
                                    const record = await insertWithJoinedSrcObs({_dbInsert:transDbInsert,
                                                                                 _fetchFromDb:transFetchFromDb, trans});

                                    //  if at any point during the transaction, any FeedRecord added to
                                    //  validationErrors, then the transaction should rollback.

                                    throwOnValidationErrors();  //  throwing in doInTransaction make it rollback
                                    return record;
                                }
                            ));
        }
        else {
            //todo TEMPORARY KLUDGE !!!! decide how to pass uniJoinedRecordMapOb to both super.Insert() here but also .Get*()
            const record =  Object.defineProperty(
                    await This._Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans}),
                                    '_uniJoinedRecordMapOb', {value:{}}); // TEMPORARY KLUDGE !!!!

            if (null === trans) {
                throwOnValidationErrors();
            }
        //  if (null !== trans), the top FeedItemRecord owning the transaction will take care of throwing,
                                //  just add to validationErrors as a sub-Insert()er.
            return record;
        }
    }

    async update(conflicts=[], _dbUpdate=dbUpdate, _fetchFromDb=fetchFromDb) {
        const { _columnsAndValuesToUpdate:[columnsToUpdate, candidateValues], } = this;
        if (!columnsToUpdate) {
            return conflicts;        //  will not be .row_persisted.
        }

        const { TableName, idDbName, id, } = this;

        // In feedCore, update concurrency issues are solves with transaction and rowVersion-based optimistic lock.
        let { row_version } = this;

        //  getFreshRowVersionAndConflicts() is used when either:
        //    - the caller of .update() doesn't provide an original rowVersion, or
        //    - this update call has lost the rowVersion-based long read-modify-write cycle against a concurrent caller
        //
        //  It returns the conflicts array if new conflicts are found and added to it, undefined otherwise.
        //
        //  Ideally this would just be a macro rather than a closure.
        const getFreshRowVersionAndConflicts = async () => {

            const conflictsPreCount = conflicts.length;

            const freshRow = await this._FetchById(id, idDbName,
                            _fetchFromDb(`SELECT * FROM ${TableName} WHERE ${idDbName} = ?`,[id]));

            const { row_retired } = freshRow;
            if ( row_retired ) {
                //                 colName,    previousKnown,     fresh, updateCandidate
                conflicts.push(['rowRetired', this.rowRetired, row_retired, undefined]);
            }
            else {  //  Check if the updater previousKnown values still match those currently persisted in db.
                for (let [colName, updateCandidate] of Object.entries(this.#toUpdate))  {
                    const previousKnown = this._previousKnownPersistedRowUpdatableValue(colName);
                    const fresh = freshRow[colName];
                    //  NOTE :  If all the previousKnown are undefined (the FeedRecord to be updated have been built
                    //          from undefined values, because the original values where not provided to the api),
                    //          then : all the entries will be flagged "in collision"
                    //                                HACK : .toJSon() backup comparision fix the "special" Date case,
                    //                                       +previousKnown !== +fresh would too, but breaks null !== 0.
                    //                                       todo: remove once schema read allows to specifically compare date ?
                    if ( previousKnown !== fresh  &&  JSON.stringify(previousKnown) !== JSON.stringify(fresh)) {
                        //  Conflict:   the currently persisted value the updater ask to update is different from
                        //              the updater previous know value it intends to update: a third party has
                        //              updated the value since the updater last fetch from Db.
                        //              This situation is akin to a git merge conflict. Intention/advise from the
                        //              updater is required to resolve the conflict (keep updating with the updater
                        //              candidate value or use the concurrently updated third-party value instead).
                        conflicts.push([colName, previousKnown, fresh, updateCandidate]);
                    }
                }
            }

            if (conflicts.length - conflictsPreCount) {                 //  new conflicts detected: return conflicts
                return conflicts;       //  will not be .row_persisted.
            }

            ({row_version} = freshRow);
        };                                                              //         no new conflict: return undefined

        //  If the original rowVersion is undefined and thus can't be used in a optimistically locked SQL UPDATE ,
        //  do full merge-conflict detection and get fresh row_version.
        if (undefined === row_version) {
            if ( await getFreshRowVersionAndConflicts() ) {
                return conflicts;
            }
        }

        //  At this point we have a "recent row_version" : either the pre-update-candidate original value
        //  or if it was undefined, the freshest value from DB (with no merge-conflict between this fresh
        //  version and the update known original values).

        candidateValues.push(id);               //  penultimate candidateValues is .id, used in WHERE clause, with
        candidateValues.push(row_version);      //  last        candidateValues is .row_version, maybe updated below.

        //  The incrementedRowVersion is not used in the following SQL UPDATE, only in ._refreshRowPersistedAndVersion()
        //  DB triggers MUST be defined that take care of that.
        //  Such trigger will override any `row_version = ${incrementedRowVersion}` anyway.
        //  Such trigger MAY include non-trivial row_persisted/row_version rules.
        let incrementedRowVersion = row_version + 1;
        const updateSqlStatement = (  'UPDATE ' + TableName +
                                    '\n   SET ' + columnsToUpdate + // `row_version = ${incrementedRowVersion}` +
                                    '\n WHERE '  + idDbName + ' = ?  AND row_version = ?' + this._sqlNotRetired );
                                                         //  ._sqlNotRetired is either ' AND row_retired IS NULL' or ''

                                                                        //  Doesn't throw on ! changedRows
        while ( ! await _dbUpdate(updateSqlStatement, candidateValues,results => results.changedRows) ) {
            //  Bummer! A concurrent read-modify-write long cycle completed ahead of this one.
            //  Let's find what can be saved of this cycle:
            if ( await getFreshRowVersionAndConflicts() ) {
                return conflicts;
            }
            //  try it again with refreshed row_version.
            incrementedRowVersion = row_version + 1;
            candidateValues[candidateValues.length - 1] = row_version + 0;    // todo change row_version + 0|10 => row_version
        }

        await this._refreshRowPersistedAndVersion(_fetchFromDb);

        return conflicts;   //  todo on transaction commit, move all #toUpdate properties values to the underlying object
    }

    async delete(_dbDelete=dbDelete) {
        const { TableName, idDbName, id } = this;
        return await _dbDelete(`DELETE FROM ${TableName} WHERE ${idDbName} = ?`, [id]);
    }

    //  Retire() is overridden with { throw Error(); }, in .Setup(), if DB Table has no row_retired column.
    static async Retire({id, feedAlias=null}, {idName=this.idDbName, _dbUpdate=dbUpdate}) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { TableName, _AssignStrByColName, _sqlNotRetired } = This;
        //  row_version matching is superfluous when retiring:
        //      the retiring decision by the retire-r is not dependent on the version / exact content
        //      of the candidate-for-retirement object. It's retired as long as it's not already retired.

        const [sqlFeed, args] =  null === feedAlias  ?  ['',                      [CURRENT_TIMESTAMP, id            ]]
                                                     :  [' AND `feed_alias` = ?', [CURRENT_TIMESTAMP, id, feedAlias ]];
        const retireSqlStatement = ('UPDATE `' + TableName +
                                 '`\n   SET `row_retired` = ?' +
                                  '\n WHERE `'+idName+'`'+_AssignStrByColName(idName) + sqlFeed + _sqlNotRetired);
                                                    //  ._sqlNotRetired is either  ' AND row_retired IS NULL'  or  ''

        return await _dbUpdate(retireSqlStatement, args,results => results.changedRows);
    }

    //  retire() is overridden with { throw Error(); }, in .Setup(), if DB Table has no row_retired column.
    async retire(_dbUpdate=dbUpdate) {
        await this.constructor.Retire(this, {_dbUpdate});
        const { row_persisted } = await this._refreshRowPersistedAndVersion();
        this.#row_retired = row_persisted;
        return row_persisted
    }

    static async _GetWithCriteria(criteriaString='', criteriaList=[], _fetchFromDb=fetchFromDb) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { _SqlSelect, _SqlFrom } = This;

        const sql = ('SELECT ' + _SqlSelect + ' FROM ' + _SqlFrom + '\n '+criteriaString);

        return This._FetchAndBuild(sql, criteriaList, _fetchFromDb);            //  unexpected non-[] rows will throw.
    }
    // noinspection JSUnusedGlobalSymbols
    async _getWithCriteria(criteriaString='', criteriaList=[], _fetchFromDb=fetchFromDb) {
        return this.constructor._GetWithCriteria(criteriaString, criteriaList, _fetchFromDb);
    }   //  todo Decide if currently unused FeedRecord.prototype._getWithCriteria (and FeedRecord._GetWithCriteria) is still needed once .update() is completed.

    static async GetWithCriteria(criteriaString='', criteriaList=[], _fetchFromDb=fetchFromDb) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.

        let topOwnerFetchedRecords;
        const multiOwnedRecords = [];
        const ownerRecordsMapObByTblNameById = {};
        const mapRecord = recordMapper(ownerRecordsMapObByTblNameById);

        //  First, fetch the rows and build the Records of This and all its MultiOwnedRecords (at all levels)
        //          and fill recordMaps from the Records who are owners of multiOwnedRecords.

         for (let [Record, {sqlSelectFrom, OwnerTblName, colNameJoiningTo, propertyName}] of This._MultiSqlSelectFroms) {

            const sql = sqlSelectFrom(criteriaString);
            // logger.debug(sql, criteriaList);

            const fetchedRecords = await Record._FetchAndBuild(sql, criteriaList, _fetchFromDb, mapRecord);

            if (undefined === colNameJoiningTo) {           //  The top Owner: not a multiOwnedFeedRecord :
                topOwnerFetchedRecords = fetchedRecords;    //  normally, the first one of This._MultiSqlSelectFroms
            }
            else {                                          //  all other are multiOwnedFeedRecords and need demux
                multiOwnedRecords.push(
                                       Object.assign(fetchedRecords, { OwnerTblName, colNameJoiningTo, propertyName}));
            }
        }

        //  Then, fill the owners arrayProperty with the fetched multiOwnedRecords .

        for (let fetchedRecords of multiOwnedRecords) {
            //  e.g. {'Patient',     'patient_id',   'legitIds'} = patientLegitIdRecords
            const {OwnerTblName, colNameJoiningTo, propertyName} = fetchedRecords;
                            //  e.g.   ownerRecordsMapObByTblNameById['Patient']     :   patientMap by id
            const ownerRecordMapById = ownerRecordsMapObByTblNameById[OwnerTblName];

    //  e.g.  legitIdRecord of patientLegitIdRecords
            for (let record of fetchedRecords) {
                ownerRecordMapById.get(record[  colNameJoiningTo ])[propertyName].push(record);
                // e.g. patientMap.get(legitIdRecord['patient_id'])[ 'legitIds' ].push(legitIdRecord)
            }   //                                    patientRecord[ 'legitIds' ].push(legitIdRecord)
        }

        return topOwnerFetchedRecords;
    }

    // noinspection JSUnusedGlobalSymbols
    static async _GetById(id, feedAlias=null, _fetchFromDb=fetchFromDb) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { _SqlSelect, _SqlFrom, TableName, idDbName, } = This;
        const [sqlFeedAlias, args] =  null === feedAlias  ?  ['', [id]]  :  [' AND `'+TableName+'`.`feed_alias` = ?', [id, feedAlias]];

        const sql = ( 'SELECT ' + _SqlSelect + ' FROM ' + _SqlFrom +
                    '\n WHERE `'+TableName+'`.`'+idDbName+'` = ?' + sqlFeedAlias  );
                    //  Don't exclude row_retired IS NOT NULL: toApiLitOb() has a .retired version

        return  await This._FetchById(id, idDbName,
                                      This._FetchAndBuild(sql, args, _fetchFromDb), feedAlias); //  throws on NoRow() !
    }

    // noinspection JSUnusedGlobalSymbols
    static async GetById(id, feedAlias=null, _fetchFromDb=fetchFromDb) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { TableName, idDbName, } = This;
        const [sqlFeedAlias, args] =  null === feedAlias  ?  ['', [id]]
                                                          :  [' AND `'+TableName+'`.`feed_alias` = ?', [id, feedAlias]];

        const criteriaString = 'WHERE `'+TableName+'`.`'+idDbName+'` = ?' + sqlFeedAlias;
                                //  Don't exclude row_retired IS NOT NULL: toApiLitOb() has a .retired version

        return await This._FetchById(id, idDbName,
                                     This.GetWithCriteria(criteriaString, args, _fetchFromDb), feedAlias)
    }
}
self.FeedRecord = FeedRecord;


//  - Adds all the properties for a FeedRecord to be used as a .ReferencedFeedItemRecord property
//    of a _ReferencedFeedRecordsParams entry,  short of already being a  FeedItemRecord :
//      .uuidDbName, ._uuidFullName, ._uuidField, .GetIdByUuid=FeedItemRecord.GetIdByUuid,
//  - Calls FeedRecord.Setup({tableName})
//  - Validates that .uuidDbName refers to a uuid in DB.
function ReferencedFeedRecordSetup() {
    const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
    const thisProto = This.prototype;

    const tableName = This.TableName,
         uuidDbName = This.uuidDbName;
    if ( uuidDbName === undefined ) throw Error(`${this.Name}.get uuidDbName() : Not defined yet. Override Me !`);

    Object.defineProperty(This,      'uuidDbName', {value:uuidDbName});
    Object.defineProperty(thisProto, 'uuidDbName', {value:uuidDbName});
    Object.defineProperty(This,      '_uuidFullName', {value:shaAndUuidFullName(tableName, uuidDbName)});

    const { GetIdByUuid, } = FeedItemRecord;
    //  Use Object.defineProperty for the IDE to keep up about GetIdByUuid being a function.
    Object.defineProperty(This, GetIdByUuid.name, {configurable:true, writable:true, value:GetIdByUuid});


    FeedRecord.Setup.call(This);


    const uuidField = This._FieldsToInsert._map.get(uuidDbName);
    if (  uuidField  &&  eUuidDbJsType === uuidField.eType ) {
        Object.defineProperty(This, '_uuidField', {value:uuidField});
    }
    else {
        throw Error(`${This.Name} .Setup() uuidDbName argument [${uuidDbName}] is not a uuid ( binary!varbinary(16) ) column of its table ${tableName}.`)
    }

    return This;
}
Object.assign(self, {ReferencedFeedRecordSetup});

const FeedRecordCanBeReferenced = FeedRecord =>
                                                (   FeedRecord.uuidDbName  &&  FeedRecord._uuidFullName  &&
                                                    FeedRecord._uuidField  &&  FeedRecord.GetIdByUuid           );

class FeedItemRecord extends FeedRecord {
    #feed_alias;
    #feed_item_id;
    constructor({feed_alias, feed_item_id, backend_item_id, ...id__row_version__row_created__row_persisted__row_retired}) {
        super(id__row_version__row_created__row_persisted__row_retired);
        this.#feed_alias = feed_alias;
        this.#feed_item_id = feed_item_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ backend_item_id});
    }

    static get FeedItemName() { return undefined; }                                     //  Candidate for overriding !
    get FeedItemName() { throw Error(`${this.Name}.prototype.get FeedItemName() : Not defined yet. Run ${this.Name}.Setup().`); }

    /**
     *
     * @returns {string}
     */
    static get uuidDbName() { return 'feed_item_id'; }                                  //  Candidate for overriding !
    /**
     *
     * @returns {string}
     */
    get uuidDbName() { throw Error(`${this.Name}.prototype.get uuidDbName() : Not defined yet. Run ${this.Name}.Setup().`); }
    /**
     *
     * @returns {string}
     */
    static get _uuidFullName() { throw Error(`${this.Name}.get _uuidFullName() : Not defined yet. Run ${this.Name}.Setup().`); }
    /**
     *
     * @returns {{}}
     */
    static get _uuidField() { throw Error(`${this.Name}.get _uuidField() : Not defined yet. Run ${this.Name}.Setup().`); }

    //region The get/set "interface": {  feedAlias, feedItemId, backendItemId, ... }

    get feed_alias() { return this.#feed_alias; }
    get feedAlias() { return this.#feed_alias; }

    get feed_item_id() { return this.#feed_item_id; }
    get feedItemId() { return this.#feed_item_id; }


    /**
     *
     * @returns {*}
     */
    // noinspection JSUnusedGlobalSymbols
    get backendItemId() { throw Error(`${this.Name}.prototype.get backendItemId() : Not defined yet. Run ${this.Name}.Setup().`); }
    // noinspection JSUnusedGlobalSymbols
    set backendItemId(value) { throw Error(`${this.Name}.prototype.set backendItemId(value=${value}) : Not defined yet. Run ${this.Name}.Setup().`); }

    //endregion

    //region LitOb

    toOwnLitOb() {
        const {  feedAlias, feedItemId, backendItemId, } = this;
        return { feedAlias, feedItemId, backendItemId, };
    }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!

    toRetiredApiLitOb(retired) {                                                        //  Overrides FeedRecord's !
        const { feedItemId, feedAlias } = this;
        return {
            feedItemId,
            feedAlias,
            retired
        };
    }
    toNonRetiredApiLitOb(apiLitOb={}) {
        const { feedItemId, feedAlias, backendItemId } = this;
        return {
            feedAlias,
            feedItemId,
            backendItemId: null === backendItemId ? undefined : backendItemId,
            ...super.toNonRetiredApiLitOb(apiLitOb),
        };
    }

    static FromRetiredApiLitOb(rowRetired, apiLitOb) {                                  //  Overrides FeedRecord's !
        const { feedItemId, feedAlias } = apiLitOb; //  feedItemId maybe undefined, on Add/Insert operation notably.
        return {
            feedItemId,
            feedAlias,
            rowRetired,
        }
    }
    static FromNonRetiredApiLitOb(apiLitOb, nativeLitOb={}) {
        const { feedItemId, backendItemId, feedAlias } = apiLitOb;
        return {
            feedAlias,
            feedItemId,
            backendItemId,
            ...super.FromNonRetiredApiLitOb(apiLitOb, nativeLitOb),
        };
    }

    //endregion

    static Setup() {
        const This = this;              //  This: the static 'this' refers to the class|constructor, not the instance.
        const thisProto = This.prototype;

        //  This.FeedItemName must be defined *BEFORE* calling super.Setup(), which uses it.

        const feedItemName = undefined === This.FeedItemName  ?  This.Name.replace('Record', '')  :  This.FeedItemName;
        Object.defineProperty(This,      'FeedItemName', {configurable: true, value:feedItemName});
        Object.defineProperty(thisProto, 'FeedItemName', {configurable: true, value:feedItemName});

        //  - adds : .uuidDbName, ._uuidFullName, ._uuidField  to This, (plus FeedItemRecord.GetIdByUuid already there)
        //  - calls FeedRecord.Setup();
        //  - validates that .uuidDbName refers to a uuid in DB.
        ReferencedFeedRecordSetup.call(This);

        return This;
    }

    /**
     *
     * @returns {{}[]}
     */
    static get _FieldsToOnlyInsert() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'feed_alias',         recName:'feedAlias',        },
            { colName:'feed_item_id',       recName:'feedItemId',       },
        ];  //  this is the static This, the constructor, not the instance
    }
    /**
     *
     * @returns {{}[]}
     */
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'backend_item_id',    recName:'backendItemId'  }
        ];
    }

    async update(conflicts=[], {insertJoined, deleteJoined, retireJoined}={}) {
        const { TableName, idDbName, id } = this;
        return await doInTransaction(async trans => {

            const { transDbUpdate, transFetchFromDb,  } = trans;

            if (insertJoined) {
                await insertJoined(this, trans.transDbInsert, trans);
            }
            if (deleteJoined) {
                await deleteJoined(this, trans.transDbDelete, trans);
            }
            if (retireJoined) {
                await retireJoined(this, trans);
            }
            conflicts = await super.update(conflicts, transDbUpdate, transFetchFromDb);

            if ( conflicts.length ) {       //  this causes Transaction rollback.
                throw UpdateConflict(`Updating ${TableName} of ${idDbName} [${id}] :\n`, conflicts);
            }

            return conflicts;

        });
    }//todo Once completed, move FeedItemRecord.prototype.update() to FeedRecord.

    static async GetByUuid(uuid, feedAlias=null, _fetchFromDb=fetchFromDb) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { TableName, uuidDbName, _AssignStrByColName, } = This;
        const [sqlFeedAlias, args] =  null === feedAlias  ?  ['', [uuid]]
                                                          :  [' AND `'+TableName+'`.`feed_alias` = ?',[uuid,feedAlias]];

        const criteriaString = 'WHERE `'+TableName+'`.`'+uuidDbName+'`'+_AssignStrByColName(uuidDbName) + sqlFeedAlias;
                                //  Don't exclude row_retired IS NOT NULL: toApiLitOb() has a .retired version

        return await This._FetchById(uuid, uuidDbName,
                                        This.GetWithCriteria(criteriaString, args, _fetchFromDb), feedAlias)
    }

    static async GetIdByUuid(uuid, feedAlias=null, validationErrors, _fetchFromDb=fetchFromDb) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { TableName, idDbName, uuidDbName, _AssignStrByColName } = This;
        const [sqlFeedAlias, args] =  null === feedAlias  ?  ['', [uuid]]
                                                          :  [' AND `'+TableName+'`.`feed_alias` = ?',[uuid,feedAlias]];

        const sql = ('SELECT `'+TableName+'`.`'+idDbName+'` FROM `' + TableName +
                  '`\n WHERE `'+TableName+'`.`'+uuidDbName+'`'+_AssignStrByColName(uuidDbName) + sqlFeedAlias);
        try {
            const row = await This._FetchById(uuid, uuidDbName,                                 //  throws on NoRow() !
                                              _fetchFromDb(sql, args), feedAlias);
            return row[idDbName];
        }   //  e.g.  [  'id'  ]
        catch (e) {
            if (e instanceof NoRow) {
                validationErrors.push(NotFound(`No ${TableName} found with .${uuidDbName}: [${
                                                uuid}] and .feed_alias: [${feedAlias}].`));
            }
            else throw e;
        }
    }

    //region The FeedItem Dao* interface (DaoPullBundle, DaoPullSingle, DaoAddSingle ... )

    static async DaoPullBundle(srcPullParams, feed) {
        const This = this;                              //  'this' is the static This: the class, not the instance.
        const { TableName, idDbName } = This;
        const { since, offset, maxItems } = srcPullParams;
        try {                           //  Don't exclude row_retired IS NOT NULL: toApiLitOb() as a retired version.
            const feedItems = await this.GetWithCriteria((
                'WHERE `'+TableName+'`.`feed_alias` = ? AND `'+TableName+'`.`row_persisted` >= ?\n' +
                'ORDER BY `'+TableName+'`.`row_persisted`, `'+TableName+'`.`'+idDbName+'` LIMIT ? OFFSET ?' ),
                [feed.alias, new Date(since),                                       maxItems, offset ] );

            return {
                offset,
                hasMore: maxItems === feedItems.length,
                results: feedItems.map(
                                        feedItem =>
                                                    feedItem.toApiLitOb() ),
            };
        }
        catch (e) { handleApiError(e, `performing pullBundle of ${This.FeedItemName} from ${feed.fullTag}`); }
    }

    static async DaoPullSingle(params, feed) {        //  'this' is the static This: the class, not the instance.
        try {
            const { feedItemId } = FeedItemRecord.FromNonRetiredApiLitOb(params);       //  typically just get .feedItemId

            const feedItem = await this.GetByUuid(feedItemId, feed.alias);                      //  throws on NoRow() !
            return feedItem.toApiLitOb();
        }
        catch (e) { handleApiError(e, `performing pullSingle of ${this.FeedItemName} from ${feed.fullTag}`); }
    }

    static async DaoAddSingle(srcLitOb, feed) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        try {
            const srcOb = This.FromApiLitOb(srcLitOb);
            srcOb.feedAlias = feed.alias;                                   //  force the .feedAlias to the one that was auth.
            const feedItem = await This.Insert({srcOb});
            return feedItem.toApiLitOb();
        }
        catch (e) { handleApiError(e, `performing addSingle of ${this.FeedItemName} to ${feed.fullTag}`); }
    }

    static async DaoRetireSingle(srcJsObFragment, feed) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        const { TableName, uuidDbName:idName, _AssignStrByColName } = This;
        try {
            const { feedItemId } = FeedItemRecord.FromNonRetiredApiLitOb(srcJsObFragment);  // typically just get feedItemId
            const feedAlias = feed.alias;                           //  force the .feedAlias to the one that was auth.

            //  returns 0 if already retired or feedAlias not matching feedItemId
            await This.Retire({id:feedItemId, feedAlias}, {idName});
            const {row_retired} = await This._FetchById(feedItemId, idName,
                        fetchFromDb( ('SELECT `row_retired` FROM `'+TableName +
                            //  e.g.    WHERE `feedItemId` = UUID_TO_BIN(?,1)
                                   '`\n WHERE `'+idName+'`'+_AssignStrByColName(idName)+' AND feed_alias = ?'),
                                    [feedItemId, feedAlias]));   //  re-qualify (feedItemId, feedAlias) match: may throw.
            return This.prototype.toRetiredApiLitOb.call({feedItemId, feedAlias}, row_retired);
        }
        catch (e) { handleApiError(e, `performing retireSingle of ${this.FeedItemName} from ${feed.fullTag}`); }
    }

    static async DaoUpdateSingle(srcLitObDiff, feed) {
        const This = this;                                  //  'this' is the static This: the class, not the instance.
        try {
            //    { feedItemId, feedItemVersion:rowVersion, lastUpdated:rowPersisted, feedAlias } = srcLitObDiff
            const baseSrcItem = FeedItemRecord.FromNonRetiredApiLitOb(srcLitObDiff);
            baseSrcItem.feedAlias = feed.alias;                        //  force the .feedAlias to the one that was auth.

            const originalSrcItem = Object.assign(baseSrcItem,
                                                  This.FromNonRetiredApiLitOb(srcLitObDiff.original));
            const feedRecord = This._BuildFeedRecordFromOriginalSrcObToUpdate(originalSrcItem);
            feedRecord._applyUpdateCandidate(srcLitObDiff.candidate);

            //todo add the MultiOwned FeedRecords to feedRecord with the update / add / delete plan (all but trivial)

            await feedRecord.update()
        }
        catch (e) { handleApiError(e, `performing addSingle of ${this.FeedItemName} to ${feed.fullTag}`); }
    }

    //endregion
}
self.FeedItemRecord = FeedItemRecord;

logger.trace("Initialized ...");
