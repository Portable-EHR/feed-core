/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { dbMsg, } = require('../../nodeCore/lib/utils');
const { dbInsert, fetchFromDb } = require('../../nodeCore/lib/dao');
const { FeedRecord, FeedItemRecord, ReferencedFeedRecordSetup, OnlyInserted, InsertAndUpdated,
        RecordJoined, UniOwned, MultiOwned, Referenced } = require('./dao');


const self = module.exports;

class UJoined extends RecordJoined {}
class URecord extends FeedRecord {
    #m_id;
    #uuid;
    static get TableName() { return 'U'; }
    static get uuidDbName() { return 'uuid'; }
    static get Joined() { return new UJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       u, uuid, m_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#m_id = m_id;
        this.#uuid = uuid;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({u, });
    }

    get uuid() { return this.#uuid; }

    toOwnLitOb() { const {  uuid, u, } = this; return { uuid, u }; }
    //      RecordU is not owned, only referenced.
    // toOwnerApiLitOb() { const { uuid, u } = this; return this._addJoinedToApiLitOb({ uuid, u }); }
    // static FromOwnedApiLitOb(ownedApiLitOb) { const {  uuid, u, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { uuid, u, }); }

    static _OwnFields = {
        m_id(colName) {     return OnlyInserted({colName, }); },
        uuid(colName) {     return OnlyInserted({colName, }); },

        u(   colName) { return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
URecord.Setup = ReferencedFeedRecordSetup;
(self.URecord = URecord).Setup();


class DJoined extends RecordJoined {}
class DRecord extends FeedRecord {
    static get TableName() { return 'D'; }
    static get Joined() { return new DJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       d}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({d});
    }

    toOwnLitOb() { const {  d, } = this; return { d }; }
    toOwnerApiLitOb() { const { d } = this; return this._addJoinedToApiLitOb({ d }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  d, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { d, }); }

    static _OwnFields = {
        d(colName) { return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.DRecord = DRecord).Setup();

class IJoined extends RecordJoined {}
class IRecord extends FeedRecord {
    static get TableName() { return 'I'; }
    static get Joined() { return new IJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       i, }) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({i});
    }

    toOwnLitOb() { const {  i, } = this; return { i }; }
    toOwnerApiLitOb() { const { i } = this; return this._addJoinedToApiLitOb({ i }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  i, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { i, }); }

    static _OwnFields = {
        i(colName) { return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.IRecord = IRecord).Setup();

class MJoined extends RecordJoined {
    // noinspection JSUnusedGlobalSymbols
    uFeedId(joinName) { return Referenced({joinName, FeedRecord:URecord, referencePropertyName:'u', colNameJoiningToReferenced:'u_id'}); }
}
class MRecord extends FeedRecord {
    static get TableName() { return 'M'; }
    static get Joined() { return new MJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       m, u_id, }) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({m, u_id, });
    }

    // noinspection JSUnusedGlobalSymbols
    get uFeedId() { throw Error(`${this.Name}.prototype.get uFeedId() : Not defined yet. Run ${this.Name}.Setup().`); }

    toOwnLitOb() { const {  m, } = this; return { m }; }
    toOwnerApiLitOb() { const { m } = this; return this._addJoinedToApiLitOb({ m }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  m, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { m, }); }

    static _OwnFields = {
        m(      colName) {  return InsertAndUpdated({colName, }); },
        u_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.MRecord = MRecord).Setup();

class NJoined extends RecordJoined {}
class NRecord extends FeedRecord {
    #h_id;
    static get TableName() { return 'N'; }
    static get Joined() { return new NJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       n, h_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#h_id = h_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({n});
    }

    // noinspection JSUnusedGlobalSymbols
    get h_id(){return this.#h_id; }

    toOwnLitOb() { const {  n, } = this; return { n }; }
    toOwnerApiLitOb() { const { n } = this; return this._addJoinedToApiLitOb({ n }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  n, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { n, }); }

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        h_id(   colName) {      return OnlyInserted({colName, }); },

        n(      colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.NRecord = NRecord).Setup();

class HJoined extends RecordJoined {
    ns(joinName) {      return MultiOwned({joinName, FeedRecord:NRecord, }); }
}
class HRecord extends FeedRecord {
    #g_id;
    #ns=[];
    static get TableName() { return 'H'; }
    static get Joined() { return new HJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       h, g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#g_id = g_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({h });
    }

    // noinspection JSUnusedGlobalSymbols
    get g_id(){return this.#g_id; }
    get ns() {return this.#ns; }

    toOwnLitOb() { const {  h, } = this; return { h }; }
    toOwnerApiLitOb() { const { h } = this; return this._addJoinedToApiLitOb({ h }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  h, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { h, }); }

    static _OwnFields = {
        g_id(colName) {     return OnlyInserted({colName, }); },

        h(   colName) { return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb,  validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.HRecord = HRecord).Setup();

class G0Joined extends RecordJoined {}
class G0Record extends FeedRecord {
    static get TableName() { return 'G'; }
    static get Joined() { return new G0Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       g}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({g});
    }

    toOwnLitOb() { const {  g, } = this; return { g }; }
    toOwnerApiLitOb() { const { g } = this; return this._addJoinedToApiLitOb({ g }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  g, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { g, }); }

    static _OwnFields = {
        g(   colName) { return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.G0Record = G0Record).Setup();

class O0Joined extends RecordJoined {
    // noinspection JSUnusedGlobalSymbols
    nextG(joinName) {   return   UniOwned({joinName, FeedRecord:G0Record, colNameJoiningToOwned: 'next_g_id'}); }
}
class O0Record extends FeedRecord {
    #prev_g_id;
    static get TableName() { return 'O'; }
    static get Joined() { return new O0Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       o, prev_g_id, next_g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#prev_g_id = prev_g_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({o, next_g_id});
    }

    get prev_g_id(){return this.#prev_g_id; }

    toOwnLitOb() { const {  o, } = this; return { o }; }
    toOwnerApiLitOb() { const { o } = this; return this._addJoinedToApiLitOb({ o }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  o, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { o, }); }

    static _OwnFields = {
        prev_g_id(  colName) {      return OnlyInserted({colName, }); },

        o(          colName) {  return InsertAndUpdated({colName, }); },
        next_g_id(  colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({ srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.O0Record = O0Record).Setup();

class G1Joined extends RecordJoined {
    os(joinName) {      return MultiOwned({joinName, FeedRecord:O0Record, colNameJoiningToOwner:'prev_g_id'}); }
}
class G1Record extends FeedRecord {
    #os=[];
    static get TableName() { return 'G'; }
    static get Joined() { return new G1Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       g}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({g});
    }

    get os() {return this.#os; }

    toOwnLitOb() { const {  g, } = this; return { g }; }
    toOwnerApiLitOb() { const { g } = this; return this._addJoinedToApiLitOb({ g }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  g, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { g, }); }

    static _OwnFields = {
        g(      colName) {  return InsertAndUpdated({colName, }); },
        i_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.G1Record = G1Record).Setup();

class O1Joined extends RecordJoined {
    // noinspection JSUnusedGlobalSymbols
    nextG(joinName) {   return   UniOwned({joinName, FeedRecord:G1Record, colNameJoiningToOwned:'next_g_id'}); }
}
class O1Record extends FeedRecord {
    #prev_g_id;
    static get TableName() { return 'O'; }
    static get Joined() { return new O1Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       o, prev_g_id, next_g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#prev_g_id = prev_g_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({o, next_g_id});
    }

    get prev_g_id(){return this.#prev_g_id; }

    toOwnLitOb() { const {  o, } = this; return { o }; }
    toOwnerApiLitOb() { const { o } = this; return this._addJoinedToApiLitOb({ o }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  o, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { o, }); }

    static _OwnFields = {
        prev_g_id(  colName) {      return OnlyInserted({colName, }); },

        o(          colName) {  return InsertAndUpdated({colName, }); },
        next_g_id(  colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.O1Record = O1Record).Setup();

class G2Joined extends RecordJoined {
    i( joinName) {      return   UniOwned({joinName, FeedRecord:IRecord, }); }
    hs(joinName) {      return MultiOwned({joinName, FeedRecord:HRecord, }); }
    // os(joinName) {
    //                     return MultiOwned({joinName, FeedRecord:O1Record, colNameJoiningToOwner:'prev_g_id'}); }
}
class G2Record extends FeedRecord {
    #hs=[];
    #os=[];
    static get TableName() { return 'G'; }
    static get Joined() { return new G2Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       g,  i_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({g, i_id});
    }

    get hs() {return this.#hs; }
    get os() {return this.#os; }

    toOwnLitOb() { const {  g, } = this; return { g }; }
    toOwnerApiLitOb() { const { g } = this; return this._addJoinedToApiLitOb({ g }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  g, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { g, }); }

    static _OwnFields = {
        g(      colName) {  return InsertAndUpdated({colName, }); },
        i_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.G2Record = G2Record).Setup();

class FJoined extends RecordJoined {
    g(joinName) {       return   UniOwned({joinName, FeedRecord:G2Record, }); }
}
class FRecord extends FeedRecord {
    static get TableName() { return 'F'; }
    static get Joined() { return new FJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       f, g_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({f, g_id});
    }

    toOwnLitOb() { const {  f, } = this; return { f }; }
    toOwnerApiLitOb() { const { f } = this; return this._addJoinedToApiLitOb({ f }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  f, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { f, }); }

    static _OwnFields = {
        f(      colName) {  return InsertAndUpdated({colName, }); },
        g_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.FRecord = FRecord).Setup();

class EJoined extends RecordJoined {
    m1(joinName) {      return   UniOwned({joinName, FeedRecord:MRecord, colNameJoiningToOwned:'m1_id'}); }
    m2(joinName) {      return   UniOwned({joinName, FeedRecord:MRecord, colNameJoiningToOwned:'m2_id'}); }
}
class ERecord extends FeedRecord {
    #l_id;
    static get TableName() { return 'E'; }
    static get Joined() { return new EJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       e, l_id, m1_id, m2_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#l_id = l_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({e, m1_id, m2_id});
    }

    // noinspection JSUnusedGlobalSymbols
    get l_id(){return this.#l_id; }
    // noinspection JSUnusedGlobalSymbols
    get lId() {return this.#l_id; }

    toOwnLitOb() { const {  e, } = this; return { e }; }
    toOwnerApiLitOb() { const { e } = this; return this._addJoinedToApiLitOb({ e }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  e, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { e, }); }

    static _OwnFields = {
        l_id(   colName) {      return OnlyInserted({colName, }); },

        e(      colName) {  return InsertAndUpdated({colName, }); },
        m1_id(  colName) {  return InsertAndUpdated({colName, }); },
        m2_id(  colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({ srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.ERecord = ERecord).Setup();

class KJoined extends RecordJoined {
    i1(joinName) {      return   UniOwned({joinName, FeedRecord:IRecord, colNameJoiningToOwned:'i1_id'}); }
    i2(joinName) {      return   UniOwned({joinName, FeedRecord:IRecord, colNameJoiningToOwned:'i2_id'}); }
}
class KRecord extends FeedRecord {
    static get TableName() { return 'K'; }
    static get Joined() { return new KJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       k,  i1_id, i2_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({k, i1_id, i2_id});
    }

    toOwnLitOb() { const {  k, } = this; return { k }; }
    toOwnerApiLitOb() { const { k } = this; return this._addJoinedToApiLitOb({ k }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  k, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { k, }); }

    static _OwnFields = {
        k(      colName) {  return InsertAndUpdated({colName, }); },
        i1_id(  colName) {  return InsertAndUpdated({colName, }); },
        i2_id(  colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.KRecord = KRecord).Setup();

class CJoined extends RecordJoined {
    d(joinName) {       return   UniOwned({joinName, FeedRecord:DRecord, }); }
}
class CRecord extends FeedRecord {
    #j_id;
    static get TableName() { return 'C'; }
    static get Joined() { return new CJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       c, j_id, d_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#j_id = j_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({c, d_id});
    }

    // noinspection JSUnusedGlobalSymbols
    get j_id(){return this.#j_id; }

    toOwnLitOb() { const {  c, } = this; return { c }; }
    toOwnerApiLitOb() { const { c } = this; return this._addJoinedToApiLitOb({ c }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  c, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { c, }); }

    static _OwnFields = {
        j_id(   colName) {      return OnlyInserted({colName, }); },

        c(      colName) {  return InsertAndUpdated({colName, }); },
        d_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.CRecord = CRecord).Setup();

class JJoined extends RecordJoined {
    m( joinName) {      return   UniOwned({joinName, FeedRecord:MRecord, }); }
    cs(joinName) {      return MultiOwned({joinName, FeedRecord:CRecord, }); }
}
class JRecord extends FeedRecord {
    #cs=[];
    static get TableName() { return 'J'; }
    static get Joined() { return new JJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       j, m_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({j, m_id});
    }

    get cs() {return this.#cs; }

    toOwnLitOb() { const {  j, } = this; return { j }; }
    toOwnerApiLitOb() { const { j } = this; return this._addJoinedToApiLitOb({ j }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  j, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { j, }); }

    static _OwnFields = {
        j(      colName) {  return InsertAndUpdated({colName, }); },
        m_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.JRecord = JRecord).Setup();

class LJoined extends RecordJoined {
    es(joinName) {      return MultiOwned({joinName, FeedRecord:ERecord, }); }
}
class LRecord extends FeedRecord {
    #a_id;
    #es=[];
    static get TableName() { return 'L'; }
    static get Joined() { return new LJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       l, a_id,}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#a_id = a_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({l, });
    }

    // noinspection JSUnusedGlobalSymbols
    get a_id(){return this.#a_id; }
    get es() {return this.#es; }

    toOwnLitOb() { const {  l, } = this; return { l }; }
    toOwnerApiLitOb() { const { l } = this; return this._addJoinedToApiLitOb({ l }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  l, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { l, }); }

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        a_id(   colName) {      return OnlyInserted({colName, }); },

        l(      colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.LRecord = LRecord).Setup();

class BJoined extends RecordJoined {
    i(joinName) {       return   UniOwned({joinName, FeedRecord:IRecord, }); }
    j(joinName) {       return   UniOwned({joinName, FeedRecord:JRecord, }); }
    k(joinName) {       return   UniOwned({joinName, FeedRecord:KRecord, }); }
}
class BRecord extends FeedRecord {
    #a_id;
    static get TableName() { return 'B'; }
    static get Joined() { return new BJoined(this); }

    constructor({id, row_version, row_created, row_persisted,       b, a_id, i_id, j_id, k_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#a_id = a_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({b, i_id, j_id, k_id});
    }

    // noinspection JSUnusedGlobalSymbols
    get a_id(){return this.#a_id; }

    toOwnLitOb() { const {  b, } = this; return { b }; }
    toOwnerApiLitOb() { const { b } = this; return this._addJoinedToApiLitOb({ b }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  b, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { b, }); }

    // noinspection JSUnusedGlobalSymbols
    static _OwnFields = {
        a_id(   colName) {      return OnlyInserted({colName, }); },

        b(      colName) {  return InsertAndUpdated({colName, }); },
        i_id(   colName) {  return InsertAndUpdated({colName, }); },
        j_id(   colName) {  return InsertAndUpdated({colName, }); },
        k_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }

}
(self.BRecord = BRecord).Setup();

class Q0Joined extends RecordJoined {
    i(joinName) {       return   UniOwned({joinName, FeedRecord:IRecord, }); }
}
class Q0Record extends FeedRecord {
    #p_id;
    static get TableName() { return 'Q'; }
    static get Joined() { return new Q0Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       q, p_id, i_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this.#p_id = p_id;
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({q, i_id});
    }

    // noinspection JSUnusedGlobalSymbols
    get p_id(){return this.#p_id; }

    toOwnLitOb() { const {  q, } = this; return { q }; }
    toOwnerApiLitOb() { const { q } = this; return this._addJoinedToApiLitOb({ q }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  q, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { q, }); }

    static _OwnFields = {
        p_id(   colName) {      return OnlyInserted({colName, }); },

        q(      colName) {  return InsertAndUpdated({colName, }); },
        i_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.Q0Record = Q0Record).Setup();

class P0Joined extends RecordJoined {
    qs(joinName) {      return MultiOwned({joinName, FeedRecord:Q0Record, }); }
}
class P0Record extends FeedRecord {
    #qs=[];
    static get TableName() { return 'P'; }
    static get Joined() { return new P0Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       p}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({p });
    }

    get qs() {return this.#qs; }

    toOwnLitOb() { const {  p, } = this; return { p }; }
    toOwnerApiLitOb() { const { p } = this; return this._addJoinedToApiLitOb({ p }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  p, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { p, }); }

    static _OwnFields = {
        p(   colName) { return InsertAndUpdated({colName, });},
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.P0Record = P0Record).Setup();

class Q1Joined extends Q0Joined {}
class Q1Record extends Q0Record {
    static get Joined() { return new Q1Joined(this); }
}

class P1Joined extends RecordJoined {
    p0(joinName) {      return   UniOwned({joinName, FeedRecord:P0Record, }); }
    qs(joinName) {      return MultiOwned({joinName, FeedRecord:Q1Record, }); }
}
class P1Record extends FeedRecord {
    #qs=[];
    static get TableName() { return 'P'; }
    static get Joined() { return new P1Joined(this); }

    constructor({id, row_version, row_created, row_persisted,       p,  p_id}) {
        super({ id, row_version, row_created, row_persisted, });
        this._setMostRecentKnownPersistedRowOwnUpdatableValues({p, p_id});
    }

    get qs() {return this.#qs; }

    toOwnLitOb() { const {  p, } = this; return { p }; }
    toOwnerApiLitOb() { const { p } = this; return this._addJoinedToApiLitOb({ p }); }
    static FromOwnedApiLitOb(ownedApiLitOb) { const {  p, } = ownedApiLitOb; return this._AddJoinedFromApiLitOb(ownedApiLitOb, { p, }); }

    static _OwnFields = {
        p(      colName) {  return InsertAndUpdated({colName, }); },
        p_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

    static async Insert({srcOb, validationErrors=[], _dbInsert=dbInsert, _fetchFromDb=fetchFromDb, trans=null}) {

        return await super.Insert({ srcOb, validationErrors, _dbInsert, _fetchFromDb, trans });
    }
}
(self.P1Record = P1Record).Setup();

class AJoined extends RecordJoined {
    j1(joinName) {      return   UniOwned({joinName, FeedRecord:JRecord, colNameJoiningToOwned:'j1_id' }); }
    j2(joinName) {      return   UniOwned({joinName, FeedRecord:JRecord, colNameJoiningToOwned:'j2_id' }); }
    f( joinName) {      return   UniOwned({joinName, FeedRecord:FRecord,    }); }
    l( joinName) {      return   UniOwned({joinName, FeedRecord:LRecord,    }); }
    p( joinName) {      return   UniOwned({joinName, FeedRecord:P1Record,   }); }
    bs(joinName) {      return MultiOwned({joinName, FeedRecord:BRecord,    }); }
}
class ARecord extends FeedItemRecord {
    #bs = [];
    static get TableName() { return 'A'; }
    static get Joined() { return new AJoined(this); }

    constructor({id, row_version, row_created, row_persisted, row_retired,  feed_alias, feed_item_id, backend_item_id,
                    a, f_id, j1_id, j2_id, l_id, p_id}) {

        super({id, row_version, row_created, row_persisted, row_retired,    feed_alias, feed_item_id, backend_item_id});

        this._setMostRecentKnownPersistedRowOwnUpdatableValues({ a, f_id, j1_id, j2_id, l_id, p_id });
    }

    get bs() { return this.#bs; }

    toOwnLitOb() { const {  a, } = this; return { a, }; }
    toNonRetiredApiLitOb() { const { a } = this;  return this._addJoinedToApiLitOb({a}); }
    // toNonRetiredApiLitOb() { const { a } = this;  return super.toNonRetiredApiLitOb({a}); }
    static FromNonRetiredApiLitOb(apiLitOb) { const { a } = apiLitOb; return super.FromNonRetiredApiLitOb(apiLitOb,{a}); }

    static _OwnFields = {
        a(      colName) {  return InsertAndUpdated({colName, }); },

        f_id(   colName) {  return InsertAndUpdated({colName, }); },
        j1_id(  colName) {  return InsertAndUpdated({colName, }); },
        j2_id(  colName) {  return InsertAndUpdated({colName, }); },
        p_id(   colName) {  return InsertAndUpdated({colName, }); },
    };

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
            // logger.info(`Fetched aRecord : ${record.toNiceJSON()}`);
            logger.info(`Fetched aRecord row : ${record.toRowJSON()}`);
            logger.info(`Fetched aRecord own : ${record.toOwnJSON()}`);
            logger.info(`Fetched aRecord native : ${record.native.toJSON()}`);
            logger.info(`Fetched aRecord json: ${JSON.stringify(record)}`);
            logger.info(`Fetched aBRecord : ${record.bs[0].toRowJSON()}`);

            if (record.bs[0].HasRowRetiredField) {
                record.bs[0].retire().catch(e => logger.error(e.message));
            }
        }
        if (records.length) {
            if ([false, true][ 1 ]  &&  records[0].toJSON() === `{"a":"a1","j1":{"j":"j1","m":{"m":"m1"},"cs":[{"c":"c1","d":{"d":"d1"}},{"c":"c2","d":{"d":"d2"}},{"c":"c3","d":{"d":"d3"}}]},"j2":{"j":"j2","m":{"m":"m2"},"cs":[{"c":"c4","d":{"d":"d4"}},{"c":"c5","d":{"d":"d5"}},{"c":"c6","d":{"d":"d6"}}]},"f":{"f":"f1","g":{"g":"g1","i":{"i":"i7"},"hs":[{"h":"h1","ns":[{"n":"n1"},{"n":"n2"}]},{"h":"h2","ns":[{"n":"n3"},{"n":"n4"}]}]}},"l":{"l":"l1","es":[{"e":"e1","m1":{"m":"m5"},"m2":{"m":"m6"}},{"e":"e2","m1":{"m":"m7"},"m2":{"m":"m8"}}]},"p":{"p":"p1","p0":{"p":"p2","qs":[{"q":"q3","i":{"i":"ia"}},{"q":"q4","i":{"i":"ib"}}]},"qs":[{"q":"q1","i":{"i":"i8"}},{"q":"q2","i":{"i":"i9"}}]},"bs":[{"b":"b1","i":{"i":"i1"},"j":{"j":"j3","m":{"m":"m3"},"cs":[{"c":"c7","d":{"d":"d7"}},{"c":"c8","d":{"d":"d8"}}]},"k":{"k":"k1","i1":{"i":"i2"},"i2":{"i":"i3"}}},{"b":"b2","i":{"i":"i4"},"j":{"j":"j4","m":{"m":"m4"},"cs":[{"c":"c9","d":{"d":"d9"}},{"c":"ca","d":{"d":"da"}}]},"k":{"k":"k2","i1":{"i":"i5"},"i2":{"i":"i6"}}}]}`) {
                logger.debug('ARecord is OK ! :-)');
            }
            else {
                logger.debug('ARecord is NOT ok ! :-(');

            }
            if ([false, true][ 0 ]) {
                const rec =  records[0], newA = ['Chaperon', 'Chaperonnette'][ 0 ];
                rec.a = newA;
                logger.info(`Changed aRecord row : ${rec.toRowJSON()}`);

                rec.update().then(({row_persisted, row_version}) => {
                    logger.info(`Updated aRecord (v.${row_version}, ${row_persisted}) : ${rec.toNiceJSON()}`);
                }).catch(e => logger.error(`ARecord.update(a = '${newA}')`, e));
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
