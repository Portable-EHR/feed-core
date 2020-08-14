/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { dbMsg, } = require('../../nodeCore/lib/utils');
const { dbInsert, fetchFromDb } = require('../../nodeCore/lib/dao');
const { FeedRecord, FeedItemRecord, ReferencedFeedRecordSetup } = require('./dao');


const self = module.exports;

class URecord extends FeedRecord {
    #m_id;
    #uuid;
    static get TableName() { return 'U'; }
    static get uuidDbName() { return 'uuid'; }


    constructor({id, row_version, row_created, row_persisted,       u, uuid, m_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#m_id = m_id;
        this.#uuid = uuid;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({u, });
    }

    get uuid() { return this.#uuid; }

    toOwnLitOb() { const {  uuid, u, } = this; return { uuid, u }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    //      RecordU is not owned, only referenced.
    // toOwnerApiLitOb() { const { uuid, u } = this; return this._addJoinedToApiLitOb({ uuid, u }); }
    // static FromOwnedApiLitOb(ownedApiLitOb) { const {  uuid, u, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { uuid, u, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'uuid',                                           },
            { colName:'m_id',                                           },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'u',      },
            // { colName:'d_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
URecord.Setup = ReferencedFeedRecordSetup;
(self.URecord = URecord).Setup();


class DRecord extends FeedRecord {
    static get TableName() { return 'D'; }

    constructor({id, row_version, row_created, row_persisted,       d}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({d});
    }

    toOwnLitOb() { const {  d, } = this; return { d }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { d } = this; return this._addJoinedToApiLitOb({ d }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  d, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { d, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'d',      },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }

}
(self.DRecord = DRecord).Setup();

class IRecord extends FeedRecord {
    static get TableName() { return 'I'; }

    constructor({id, row_version, row_created, row_persisted,       i, }) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({i});
    }

    toOwnLitOb() { const {  i, } = this; return { i }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { i } = this; return this._addJoinedToApiLitOb({ i }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  i, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { i, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'i',      },
            // { colName:'d_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.IRecord = IRecord).Setup();

class MRecord extends FeedRecord {
    static get TableName() { return 'M'; }

    constructor({id, row_version, row_created, row_persisted,       m, u_id, }) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({m, u_id, });
    }

    // noinspection JSUnusedGlobalSymbols
    get uFeedId() { throw Error(`${this.Name}.prototype.get uFeedId() : Not defined yet. Run ${this.Name}.Setup().`); }

    toOwnLitOb() { const {  m, } = this; return { m }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { m } = this; return this._addJoinedToApiLitOb({ m }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  m, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { m, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'m',      },
            { colName:'u_id',   },
        ];
    }

    static get _ReferencedFeedRecordsParams() {
        return [
            ...super._ReferencedFeedRecordsParams,
            { ReferencedFeedItemRecord:URecord, referencePropertyName:'u', referenceIdPropertyName:'uFeedId', colNameJoiningToReferenced: 'u_id'},
        ]
    }
    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.MRecord = MRecord).Setup();

class NRecord extends FeedRecord {
    #h_id;
    static get TableName() { return 'N'; }

    constructor({id, row_version, row_created, row_persisted,       n, h_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#h_id = h_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({n});
    }

    get h_id(){return this.#h_id; }
    get hId() {return this.#h_id; }

    toOwnLitOb() { const {  n, } = this; return { n }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { n } = this; return this._addJoinedToApiLitOb({ n }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  n, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { n, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'h_id',    recName:'hId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'n',      },
            // { colName:'d_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.NRecord = NRecord).Setup();

class HRecord extends FeedRecord {
    #g_id;
    #ns=[];
    static get TableName() { return 'H'; }

    constructor({id, row_version, row_created, row_persisted,       h, g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#g_id = g_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({h });
    }

    get g_id(){return this.#g_id; }
    get gId() {return this.#g_id; }
    get ns() {return this.#ns; }

    toOwnLitOb() { const {  h, } = this; return { h }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { h } = this; return this._addJoinedToApiLitOb({ h }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  h, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { h, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'g_id',    recName:'gId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'h',      },
            // { colName:'d_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:NRecord, ownerArrayPropertyName:'ns' },
        ]
    }

    static async Insert({srcOb,  validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.HRecord = HRecord).Setup();

class G0Record extends FeedRecord {
    static get TableName() { return 'G'; }

    constructor({id, row_version, row_created, row_persisted,       g}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({g});
    }

    toOwnLitOb() { const {  g, } = this; return { g }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { g } = this; return this._addJoinedToApiLitOb({ g }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  g, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { g, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'g',      },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.G0Record = G0Record).Setup();

class O0Record extends FeedRecord {
    #prev_g_id;
    static get TableName() { return 'O'; }

    constructor({id, row_version, row_created, row_persisted,       o, prev_g_id, next_g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#prev_g_id = prev_g_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({o, next_g_id});
    }

    get prev_g_id(){return this.#prev_g_id; }
    get prevGId() {return this.#prev_g_id; }

    toOwnLitOb() { const {  o, } = this; return { o }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { o } = this; return this._addJoinedToApiLitOb({ o }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  o, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { o, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'prev_g_id',    recName:'prevGId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'o',      },
            { colName:'next_g_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:G0Record, ownerPropertyName:'nextG', colNameJoiningToOwned: 'next_g_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
        ]
    }

    static async Insert({ srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.O0Record = O0Record).Setup();

class G1Record extends FeedRecord {
    #os=[];
    static get TableName() { return 'G'; }

    constructor({id, row_version, row_created, row_persisted,       g}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({g});
    }

    get os() {return this.#os; }

    toOwnLitOb() { const {  g, } = this; return { g }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { g } = this; return this._addJoinedToApiLitOb({ g }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  g, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { g, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'g',      },
            { colName:'i_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:O0Record, ownerArrayPropertyName:'os', colNameJoiningToOwner:'prev_g_id' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.G1Record = G1Record).Setup();

class O1Record extends FeedRecord {
    #prev_g_id;
    static get TableName() { return 'O'; }

    constructor({id, row_version, row_created, row_persisted,       o, prev_g_id, next_g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#prev_g_id = prev_g_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({o, next_g_id});
    }

    get prev_g_id(){return this.#prev_g_id; }
    get prevGId() {return this.#prev_g_id; }

    toOwnLitOb() { const {  o, } = this; return { o }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { o } = this; return this._addJoinedToApiLitOb({ o }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  o, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { o, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'prev_g_id',    recName:'prevGId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'o',      },
            { colName:'next_g_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:G1Record, ownerPropertyName:'nextG', colNameJoiningToOwned: 'next_g_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.O1Record = O1Record).Setup();

class G2Record extends FeedRecord {
    #hs=[];
    #os=[];
    static get TableName() { return 'G'; }

    constructor({id, row_version, row_created, row_persisted,       g,  i_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({g, i_id});
    }

    get hs() {return this.#hs; }
    get os() {return this.#os; }

    toOwnLitOb() { const {  g, } = this; return { g }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { g } = this; return this._addJoinedToApiLitOb({ g }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  g, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { g, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'g',      },
            { colName:'i_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:IRecord, ownerPropertyName:'i', colNameJoiningToOwned: 'i_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:HRecord, ownerArrayPropertyName:'hs' },
            // { MultiOwnedFeedRecord:O1Record, ownerArrayPropertyName:'os', colNameJoiningToOwner:'prev_g_id' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.G2Record = G2Record).Setup();

class FRecord extends FeedRecord {
    static get TableName() { return 'F'; }

    constructor({id, row_version, row_created, row_persisted,       f, g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({f, g_id});
    }

    toOwnLitOb() { const {  f, } = this; return { f }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { f } = this; return this._addJoinedToApiLitOb({ f }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  f, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { f, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'f',      },
            { colName:'g_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:G2Record, ownerPropertyName:'g', colNameJoiningToOwned: 'g_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:HRecord, ownerArrayPropertyName:'hs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.FRecord = FRecord).Setup();

class ERecord extends FeedRecord {
    #l_id;
    static get TableName() { return 'E'; }

    constructor({id, row_version, row_created, row_persisted,       e, l_id, m1_id, m2_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#l_id = l_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({e, m1_id, m2_id});
    }

    get l_id(){return this.#l_id; }
    get lId() {return this.#l_id; }

    toOwnLitOb() { const {  e, } = this; return { e }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { e } = this; return this._addJoinedToApiLitOb({ e }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  e, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { e, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'l_id',    recName:'lId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'e',      },
            { colName:'m1_id',   },
            { colName:'m2_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:MRecord, ownerPropertyName:'m1', colNameJoiningToOwned: 'm1_id' },
            { UniOwnedFeedRecord:MRecord, ownerPropertyName:'m2', colNameJoiningToOwned: 'm2_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({ srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.ERecord = ERecord).Setup();

class KRecord extends FeedRecord {
    static get TableName() { return 'K'; }

    constructor({id, row_version, row_created, row_persisted,       k,  i1_id, i2_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({k, i1_id, i2_id});
    }

    toOwnLitOb() { const {  k, } = this; return { k }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { k } = this; return this._addJoinedToApiLitOb({ k }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  k, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { k, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'k',      },
            { colName:'i1_id',   },
            { colName:'i2_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:IRecord, ownerPropertyName:'i1', colNameJoiningToOwned: 'i1_id' },
            { UniOwnedFeedRecord:IRecord, ownerPropertyName:'i2', colNameJoiningToOwned: 'i2_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.KRecord = KRecord).Setup();

class CRecord extends FeedRecord {
    #j_id;
    static get TableName() { return 'C'; }

    constructor({id, row_version, row_created, row_persisted,       c, j_id, d_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#j_id = j_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({c, d_id});
    }

    get j_id(){return this.#j_id; }
    get jId() {return this.#j_id; }

    toOwnLitOb() { const {  c, } = this; return { c }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { c } = this; return this._addJoinedToApiLitOb({ c }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  c, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { c, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'c',      },
            { colName:'d_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.CRecord = CRecord).Setup();

class JRecord extends FeedRecord {
    #cs=[];
    static get TableName() { return 'J'; }

    constructor({id, row_version, row_created, row_persisted,       j, m_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({j, m_id});
    }

    get cs() {return this.#cs; }

    toOwnLitOb() { const {  j, } = this; return { j }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { j } = this; return this._addJoinedToApiLitOb({ j }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  j, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { j, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            // { colName:'j_id',    recName:'jId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'j',      },
            { colName:'m_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:MRecord, ownerPropertyName:'m', colNameJoiningToOwned: 'm_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:CRecord, ownerArrayPropertyName:'cs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.JRecord = JRecord).Setup();

class LRecord extends FeedRecord {
    #a_id;
    #es=[];
    static get TableName() { return 'L'; }

    constructor({id, row_version, row_created, row_persisted,       l, a_id,}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#a_id = a_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({l, });
    }

    get a_id(){return this.#a_id; }
    get es() {return this.#es; }

    toOwnLitOb() { const {  l, } = this; return { l }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { l } = this; return this._addJoinedToApiLitOb({ l }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  l, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { l, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'a_id',                                                               },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'l',      },
            // { colName:'d_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:DRecord, ownerPropertyName:'d', colNameJoiningToOwned: 'd_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:ERecord, ownerArrayPropertyName:'es' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.LRecord = LRecord).Setup();

class BRecord extends FeedRecord {
    #a_id;
    static get TableName() { return 'B'; }

    constructor({id, row_version, row_created, row_persisted,       b, a_id, i_id, j_id, k_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#a_id = a_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({b, i_id, j_id, k_id});
    }

    get a_id(){return this.#a_id; }
    get aId() {return this.#a_id; }

    toOwnLitOb() { const {  b, } = this; return { b }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { b } = this; return this._addJoinedToApiLitOb({ b }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  b, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { b, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'a_id',    recName:'aId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'b',      },
            { colName:'i_id',   },
            { colName:'j_id',   },
            { colName:'k_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:IRecord, ownerPropertyName:'i', colNameJoiningToOwned: 'i_id' },
            { UniOwnedFeedRecord:JRecord, ownerPropertyName:'j', colNameJoiningToOwned: 'j_id' },
            { UniOwnedFeedRecord:KRecord, ownerPropertyName:'k', colNameJoiningToOwned: 'k_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            // { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }

}
(self.BRecord = BRecord).Setup();

class Q0Record extends FeedRecord {
    #p_id;
    static get TableName() { return 'Q'; }

    constructor({id, row_version, row_created, row_persisted,       q, p_id, i_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#p_id = p_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({q, i_id});
    }

    get p_id(){return this.#p_id; }
    get pId() {return this.#p_id; }

    toOwnLitOb() { const {  q, } = this; return { q }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { q } = this; return this._addJoinedToApiLitOb({ q }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  q, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { q, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            { colName:'p_id',    recName:'pId',                       },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'q',      },
            { colName:'i_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:IRecord, ownerPropertyName:'i', colNameJoiningToOwned: 'i_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.Q0Record = Q0Record).Setup();

class Q1Record extends Q0Record {
}
(self.Q1Record = Q1Record).Setup();

class P0Record extends FeedRecord {
    #qs=[];
    static get TableName() { return 'P'; }

    constructor({id, row_version, row_created, row_persisted,       p,  p_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({p, p_id});
    }

    get qs() {return this.#qs; }

    toOwnLitOb() { const {  p, } = this; return { p }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { p } = this; return this._addJoinedToApiLitOb({ p }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  p, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { p, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'p',      },
            { colName:'p_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            // { UniOwnedFeedRecord:P0Record, ownerPropertyName:'p0', colNameJoiningToOwned: 'p_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:Q0Record, ownerArrayPropertyName:'qs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.P0Record = P0Record).Setup();

class P1Record extends FeedRecord {
    #qs=[];
    static get TableName() { return 'P'; }

    constructor({id, row_version, row_created, row_persisted,       p,  p_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({p, p_id});
    }

    get qs() {return this.#qs; }

    toOwnLitOb() { const {  p, } = this; return { p }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toOwnerApiLitOb() { const { p } = this; return this._addJoinedToApiLitOb({ p }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  p, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { p, }); }

    static get _FieldsToOnlyInsert() {
        //       colName,                   recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'p',      },
            { colName:'p_id',   },
        ];
    }

    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:P0Record, ownerPropertyName:'p0', colNameJoiningToOwned: 'p_id' },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:Q1Record, ownerArrayPropertyName:'qs' },
        ]
    }

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.P1Record = P1Record).Setup();

class ARecord extends FeedItemRecord {
    #bs = [];
    static get TableName() { return 'A'; }

    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                    a, f_id, j1_id, j2_id, l_id, p_id}) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});

        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ a, f_id, j1_id, j2_id, l_id, p_id });
    }

    get bs() { return this.#bs; }

    toOwnLitOb() { const {  a, } = this; return { a, }; }
    _toSuperOwnLitOb() { return { ...super._toSuperOwnLitOb(), ...super.toOwnLitOb() }; }   //  Magic!
    toNonRetiredApiLitOb() { const { a } = this;  return this._addJoinedToApiLitOb({a}); }
    // toNonRetiredApiLitOb() { const { a } = this;  return super.toNonRetiredApiLitOb({a}); }
    static FromNonRetiredApiLitOb(apiLitOb) { const { a } = apiLitOb; return super.FromNonRetiredApiLitOb(apiLitOb,{a}); }

    static get _FieldsToOnlyInsert() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToOnlyInsert,
            //  {        ,                                     ,                                },
        ];
    }
    static get _FieldsToInsertAndUpdate() {
        //    colName,                      recName=colName,            recEnum=null
        return [
            ...super._FieldsToInsertAndUpdate,
            { colName:'a',      },

            //  No .recName provided/necessary: the .whateverId getter & setter are NOT defined for any
            //  .whatever_id which is specified as .colNameJoiningToOwned of a _UniOwnedFeedRecordsParams
            //  entry, or as .colNameJoiningToReferenced of a _ReferencedFeedRecordsParams entry.
            { colName:'f_id',                                                   },
            { colName:'j1_id',                                                  },
            { colName:'j2_id',                                                  },
            // { colName:'l_id',                                                   },
            { colName:'p_id',                                                   },
        ];
    }
    static get _ReferencedFeedRecordsParams() {
        return [
            ...super._ReferencedFeedRecordsParams,
            // { ReferencedFeedItemRecord:LRecord, referencePropertyName:'l', referenceIdPropertyName:'feedLId', colNameJoiningToReferenced: 'l_id'},
        ]
    }
    static get _UniOwnedFeedRecordsParams() {
        return [
            ...super._UniOwnedFeedRecordsParams,
            { UniOwnedFeedRecord:JRecord, ownerPropertyName:'j1', colNameJoiningToOwned: 'j1_id' },
            { UniOwnedFeedRecord:JRecord, ownerPropertyName:'j2', colNameJoiningToOwned: 'j2_id' },
            { UniOwnedFeedRecord:FRecord, ownerPropertyName:'f',    /*colNameJoiningToOwned: 'f_id'*/ },
            { UniOwnedFeedRecord:LRecord, ownerPropertyName:'l',    /*colNameJoiningToOwner: 'l_id'*/ },
            { UniOwnedFeedRecord:P1Record, ownerPropertyName:'p',    /*colNameJoiningToOwned: 'p_id'*/ },
        ]
    }
    static get _MultiOwnedFeedRecordsParams() {
        return [
            ...super._MultiOwnedFeedRecordsParams,
            { MultiOwnedFeedRecord:BRecord, ownerArrayPropertyName:'bs' },
        ]
    }

    //  Schema-based type validation, plus basic enhancements, such as iso8601 string conversion to js Date and default
    //      conversion of undefined properties to null, if allowed, is auto-done internally in validateNMorphToCol().
    //  What SHOULD be customized here is default conversion of undefined properties to non-null values.
    /**
     * @param {{feedAlias: string, a: string,
     *          j1: {j: string, m:  {m: string,}, cs: {c: string, d: {d: string,}}[], }|undefined,
     *          j2: {j: string, m:  {m: string,}, cs: {c: string, d: {d: string,}}[], }|undefined,
     *          bs: {b: string, i:  {i: string,}, j:  {j: string, m: {m: string,}, cs: {c: string, d: {d: string,}}[],},}[]|undefined,
     *          l:  {l: string, es: {e: string, m1: {m: string,}, m2: {m: string,},}[], }|undefined,
     *          p:  {p: string, qs: {q: string, i:  {i: string,},}[], p0: {p: string, qs: {q: string, i: {i: string,},}[],},}|undefined,
     *          f:  {f: string, g: {g: string, i:  {i: string,}, hs: {h: string, ns: {n: string,}[], }[]|undefined,
     *                                         os: {o: string, g: {g: string, os: {o: string, g: {g: string,},}[],},}[],},}|undefined,
     *          }} srcOb
     * @param {string[]}validationErrors
     * @returns {Promise<ARecord>}
     * @constructor
     */
    static async Insert({srcOb={feedAlias:'test', a:'a1',
                                j1:{j:'j1', m:{m:'m1'},cs:[{c:'c1',d:{d:'d1'}},{c:'c2',d:{d:'d2'}},{c:'c3',d:{d:'d3'}}] },
                                j2:{j:'j2', m:{m:'m2'},cs:[{c:'c4',d:{d:'d4'}},{c:'c5',d:{d:'d5'}},{c:'c6',d:{d:'d6'}}] },
                                bs:[{b:'b1',i:{i:'i1'}, j:{j:'j3', m:{m:'m3'},cs:[{c:'c7',d:{d:'d7'}},{c:'c8',d:{d:'d8'}}] }, k:{k:'k1',i1:{i:'i2'},i2:{i:'i3'}}},
                                    {b:'b2',i:{i:'i4'}, j:{j:'j4', m:{m:'m4'},cs:[{c:'c9',d:{d:'d9'}},{c:'ca',d:{d:'da'}}] }, k:{k:'k2',i1:{i:'i5'},i2:{i:'i6'}}},],
                                l:{l:'l1',es:[{e:'e1',m1:{m:'m5'},m2:{m:'m6'}},{e:'e2',m1:{m:'m7'},m2:{m:'m8'}}]},
                                f:{f:'f1',g:{g:'g1', i:{i:'i7'}, hs:[{h:'h1', ns:[{n:'n1'},{n:'n2'}]},
                                                                     {h:'h2', ns:[{n:'n3'},{n:'n4'}]}],
                                                    os:[{o:'o1', g:{g:'g2', os:[{o:'o2', g:{g:'g3'}},
                                                                                {o:'o3', g:{g:'g4'}}]}},
                                                        {o:'o4', g:{g:'g5', os:[{o:'o5', g:{g:'g6'}},
                                                                                {o:'o6', g:{g:'g7'}}]}}], }, },
                                p:{p:'p1', qs:[{q:'q1', i:{i:'i8'}}, {q:'q2', i:{i:'i9'}}], p0:
                                  {p:'p2', qs:[{q:'q3', i:{i:'ia'}}, {q:'q4', i:{i:'ib'}}]}},
                                                                                                                   },
                                                                                                validationErrors=[]}) {
        return await super.Insert({ srcOb, validationErrors});
    }
}
(self.ARecord = ARecord).Setup();

if ([false, true][ 0 ]) {
    const validationErrors =[];
    ARecord.Insert({validationErrors, }
    ).then(aRecord => {
        logger.info(`Inserted ARecord : ${aRecord.toJSON()}`);
        // aRecord.retire().then(updatedCnt => {
        //     logger.info(`aRecord : ${aRecord.toNiceJSON()}`);
        // });
    }).catch(e => logger.error(`ARecord.Insert()`, dbMsg(e)));
}
else if ([false, true][ 1 ]) {
    const a = ['a1', ][ 0 ];
    ARecord.GetWithCriteria('WHERE A.a = ?', [a]
    ).then(records => {
        for (let record of records) {
            logger.info(`Fetched aRecord : ${record.toNiceJSON()}`);
            logger.info(`Fetched aRecord row : ${record.toRowJSON()}`);
            logger.info(`Fetched aRecord own : ${record.toOwnJSON()}`);
            logger.info(`Fetched aRecord native : ${record.native.toJSON()}`);
            logger.info(`Fetched aBRecord : ${record.bs[0].toRowJSON()}`);

            if (record.bs[0].HasRowRetiredField) {
                record.bs[0].retire().catch(e => logger.error(e.message));
            }
        }
        if (records.length) {
            if ([false, true][ 0 ]) {                                           //  WARNING  :  DELETE ! ! !
                const rec =  records[records.length-1];
                rec.delete().then(() =>{
                    logger.info(`Deleted aRecord : ${rec.toFullOwnJSON()}`);

                }).catch(e =>
                    logger.error(`ARecord.delete(id=${rec.id}')`, e));
            }
            else {
                if ([false, true][ 0 ]) {
                    const rec =  records[0], newA = ['Chaperon', 'Chaperonnette'][ 0 ];
                    rec.a = newA;
                    logger.info(`Changed aRecord row : ${rec.toRowJSON()}`);

                    rec.update().then(({row_persisted, row_version}) => {
                        logger.info(`Updated aRecord (v.${row_version}, ${row_persisted}) : ${rec.toNiceJSON()}`);
                    }).catch(e => logger.error(`ARecord.update(a = '${newA}')`, e));
                }
            }
        }
    }).catch(e => logger.error(`ARecord.GetWithCriteria(first_name = '${a}')`, e))
}
else if ([false, true][ 0 ]) {
    const s0 = {sql:  `SELECT C.*, d.*`+
                    `\n  FROM ( SELECT * FROM A`+
                    `\n          WHERE A.a = ?) AS A`+
                    `\n  JOIN B AS bs ON  A.id = bs.a_id`+
                    `\n  JOIN C ON  bs.j_id = C.j_id  OR  A.j1_id = C.j_id  OR  A.j2_id = C.j_id`+
                    `\n  LEFT JOIN D AS d ON  C.d_id = d.id`,  nestTables: true};

    const s1 = {sql:  `SELECT C.*, d.*`+
                    `\n  FROM ( SELECT * FROM A`+
                    `\n          WHERE A.a = ?) AS A`+
                    `\n  JOIN B AS bs ON  A.id = bs.a_id`+
                    `\n  JOIN C ON  A.j1_id = C.j_id  OR  A.j2_id = C.j_id`+//  OR  bs.j_id = C.j_id `+
                    `\n  LEFT JOIN D AS d ON  C.d_id = d.id`,  nestTables: true};

    const s2 = {sql:  `SELECT C.*, d.*`+
                    `\n  FROM ( SELECT * FROM A`+
                    `\n          WHERE A.a = ?) AS A`+
                    `\n  JOIN C ON  A.j1_id = C.j_id  OR  A.j2_id = C.j_id`+
                    `\n  LEFT JOIN D AS d ON  C.d_id = d.id`+
                    `\nUNION`+
                    `\nSELECT C.*, d.*`+
                    `\n  FROM ( SELECT * FROM A`+
                    `\n          WHERE A.a = ?) AS A`+
                    `\n  JOIN B AS bs ON  A.id = bs.a_id`+
                    `\n  JOIN C ON  bs.j_id = C.j_id`+
                    `\n  LEFT JOIN D AS d ON  C.d_id = d.id`,  nestTables: true};

    const s3 = {sql:  `SELECT DISTINCT C.*, d.*`+
                    `\n  FROM ( SELECT * FROM A`+
                    `\n          WHERE A.a = ?) AS A`+
                    `\n  JOIN B AS bs ON  A.id = bs.a_id`+
                    `\n  JOIN C ON  bs.j_id = C.j_id  OR  A.j1_id = C.j_id  OR  A.j2_id = C.j_id`+
                    `\n  LEFT JOIN D AS d ON  C.d_id = d.id`,  nestTables: true};

    const s4 = {sql:  `SELECT C.*, d.*`+
                    `\n  FROM C`+
                    `\n  LEFT JOIN D AS d ON  C.d_id = d.id`+
                    `\n  WHERE EXISTS (`+
                    `\n     SELECT 1`+
                    `\n     FROM ( SELECT * FROM A`+
                    `\n            WHERE A.a = ?) AS A`+
                    `\n     JOIN B AS bs ON  A.id = bs.a_id`+
                    `\n     WHERE  bs.j_id = C.j_id  OR  A.j1_id = C.j_id  OR  A.j2_id = C.j_id`+
                    `\n  )`,  nestTables: true};

    const s = [s0, s1, s2, s3, s4];
    fetchFromDb( s[ 3 ], [['a1','a1'],['creamedDP', new Date(['1979-01-01', '2020-06-07T00:20:00.000Z'][ 1 ]), 10, 0]]
                  [ 0 ])
        .then(rows => {
            for (let row of rows) {
                logger.debug(row, 'plusss', row[''] );
            }
        }).catch( e =>
        logger.error(`Fetching MultiAddress : `, dbMsg(e)));
}

logger.trace("Initialized ...");
