### feedcore librairies

This module include multiple libraries that are likely to be required in any Feed implementation.

- api : the basic functions which, in combination with sapi, makes routes handling trivial, notably:
    - handeReq 
    - applyHandlerForCommand 
    - handleApiSuccess
    - handleApiError
    - defaultApiErrorHandling
    - handleNotFound
    - handleApiUnreachable
    - handleMalformed
    - handleAuth
    - handleUnknownCommand
    - handleGetOk
    - handleGetError
    - logRequest
    - reply

- config.feed : the base definitions of 
    - Feed and 
    - Feeds classes,  
    - EFeedState and 
    - EFeedKind enums, and 
    - FeedByFeedKind mapOb.

- config : the nodecore/lib/config NodeConfig class extension, common to all Feeds.

- dao : uses nodecore lib/dao to provide :
    - FeedRecord and 
    - FeedRecordItem classes, used to extend Record classes using : 
    - Field and 
    - RecordJoined classes, with the help of :  
    - OnlyInserted and
    - InsertAndUpdated function for Field class extension, and :
    - Referenced,
    - UniOwned and
    - MultiOwned functions for RecordJoined class extension.
    
- dao.patient : provides :
    - BirthPlaceRecord class 
    - CivicAddressRecord class 
    - MultiAddressRecord class 
    - ContactRecord class 
    - FullContactRecord class
    - MultiContactRecord class
    - PatientLegitIdRecord class
    - PatientRecord class
    - PatientReachabilityRecord class
    - EGender enum
    - ELanguage enum
    
- dao.practitioner : provides :
    - PractitionerLegitIdRecord class and
    - PractionerRecord class
    
- dao.rdv : provides :
    - RdvRecord class
    - RdvPractitionerRecord class
    - AppointmentRecord class
    - RdvDispositionRecord class, and
    - ERdvDisposition enum 
    - ERdvLocation enum
    - ERdvConfirmationStatus enum
 
- dao.privateMessage : provides :
    - PrivateMessageAttachmentRecord class
    - PrivateMessageRecord class    
    - PrivateMessageContentRecord class 
    - PrivateMessageStatusRecord class, and
    - PrivateMessageStatusRecord enum
    
- dao shared : provides EIssuerKind enum

- feed.core : provides :
    - Eflow enum and its eFlowsToBackend and eFlowsToFeed EItems.
    - FeedOp class
    - logFeedOpCall and 
    - expectedErrorLogMessage, unexpectedErrorShortMessage, expectedErrorShortMessage, expectedErrorStatus functions
    - enhanced by DeclareFeedOpError() versions of IpSocketError, StatusError, Unpacking, FeedHubError constructors.

- feed.core.ops : provides : 
    - FeedPullSingle class 
    - FeedPullBundle class
    - FeedBundleResponse class
    - FeedPushSingle class
    
- feedhub.ops : provides :
    - BackendPatientBundleResponse and PullBackendPatientBundle classes
    - BackendIdIssuersBundleResponse and PullBackendIdIssuersBundle classes
    - PullSingledBackendPatientReachability class
    - PushSinglePrivateMessageNotification class
    
- nao.feedhub : provides : 
    - PostToFeedHub class
    - performFeedHubPost function
    - performFeedHubGet function
    - pingFeedHubServer function
    - pingBackendServer function
    - reportWtf function

- sapi : provides the Provider class that serves as template for the Feed own sapi implementation to extend with 
         working methods.  It includes : 
    - static _PullBundles(), _PullSingles(), _PushSingles(), _AddSingles(), _UpdateSingles(), _RetireSingles() and _Search() methods,
    - pingFeedHub() and pingBackend() methods, 
    
    - practitionerFeedOps() method filled with :
        - pullPractitionerBundle() 
        - pullSinglePractitioner()
        - addSinglePractitioner()
        - updateSinglePractitioner()
        - retireSinglePractitioner()
        - searchPractitioner() 
    
    - patientFeedOps() method filled with :
        - pullPatientBundle()
        - pullSinglePatient()
        - addSinglePatient()
        - updateSinglePatient()
        - retireSinglePatient()
        - searchPatient()
    
    - patientReachabilityFeedOps() method filled with :
        - pushSinglePatientReachability()
    
    - privateMessageStatusFeedOps() method filled with :
        - pushSinglePrivateMessageStatus()
    
    - privateMessageFeedOps() method filled with :
        - pullSinglePrivateMessageContent()
    
    - appointmentFeedOps() method filled with :
        - pullAppointmentBundle()
        - pullSingleAppointment()
    
    - rdvDispositionFeedOps() method filled with :
        - pushSingleRdvDisposition()
    
    - backendIdIssuersFeedOps() method filled with :
        - pullBackendIdIssuersBundle()
    
    - backendPatientFeedOps() method filled with :
        - pullBackendPatientBundle()
    
    - backendPatientReachabilityFeedOps() method filled with :
        - pullSingleBackendPatientReachability()
    
    - backendPrivateMessageNotificationFeedOps() method filled with :
        - pushSinglePrivateMessageNotification()
        
    