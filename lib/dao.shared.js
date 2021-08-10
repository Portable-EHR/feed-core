/*
 * Copyright © Portable EHR inc, 2020
 */

'use strict';
const fileTag = __filename.replace(/(.*\/)(.+?)([.]js)?$/, '$2');

const logger  = require('log4js').getLogger(fileTag);

const { Enum, EItem, } = require('../../nodecore/lib/utils');

const self = module.exports;


const EIssuerKind = (f=>{f.prototype=new Enum(f); return new f({});})(function EIssuerKind({
    healthCare     =(f=>f(f))(function healthCare(f)        { return EItem(EIssuerKind, f); }),
    socialSecurity =(f=>f(f))(function socialSecurity(f)    { return EItem(EIssuerKind, f); }),
    passport       =(f=>f(f))(function passport(f)          { return EItem(EIssuerKind, f); }),
    driverLicense  =(f=>f(f))(function driverLicense(f)     { return EItem(EIssuerKind, f); }),
    practiceLicense=(f=>f(f))(function practiceLicense(f)   { return EItem(EIssuerKind, f); }),
    stateID        =(f=>f(f))(function stateID(f)           { return EItem(EIssuerKind, f); }),
    other          =(f=>f(f))(function other(f)             { return EItem(EIssuerKind, f); }),
}) {  Enum.call(Object.assign(this, {healthCare, socialSecurity, passport, driverLicense,
practiceLicense, stateID, other})); });
self.EIssuerKind=EIssuerKind;

const {
    healthCare      : eIssuerHealthCare,
    socialSecurity  : eIssuerSocialSecurity,
    passport        : eIssuerPassport,
    driverLicense   : eIssuerDriverLicense,
    practiceLicense : eIssuerPracticeLicense,
    stateID         : eIssuerStateID,
    other           : eIssuerOther,
} = EIssuerKind;

[ eIssuerHealthCare, eIssuerSocialSecurity, eIssuerPassport, eIssuerDriverLicense,
  eIssuerPracticeLicense, eIssuerStateID, eIssuerOther, ].join();    //  Kludge to prevent stupid 'unused' warnings.


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


const ELanguage = (f=>{f.prototype=new Enum(f); return new f({});})(function ELanguage({
    fr=(f=>f(f))(function fr(f) { return EItem(ELanguage, f); }),
    en=(f=>f(f))(function en(f) { return EItem(ELanguage, f); }),
    // es=(f=>f(f))(function es(f) { return EItem(ELanguage, f); }),
}) {  Enum.call(Object.assign(this, {fr, en/*, es*/})); });
self.ELanguage = ELanguage;
const {
    fr: eLanguageFr,
    en: eLanguageEn,
} = ELanguage;

[ eLanguageFr, eLanguageEn, ].join();    //  Kludge to prevent stupid 'unused' warnings.

logger.trace("Initialized ...");
