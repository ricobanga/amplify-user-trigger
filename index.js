
// const userPoolId = process.env.AUTH_<WHATEVER>_USERPOOLID;
// const appsyncUrl = process.env.API_<WHATEVER>_GRAPHQLAPIENDPOINTOUTPUT;

const {CognitoIdentityServiceProvider} = require('aws-sdk');
const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider();
const {request} = require('/opt/appSyncRequest')

// replace 'updateWhatever' by real entity mutation
const {updateWhatever: updateUser} = require('/opt/graphql/mutations')

// set it if you want to add the user in a group
const groupToAdd = false;

// field of entity that is used as cognito Username ("email" or any "login" field), depending on cognito settings
const userNameField = "email"

// field of entity where Cognito sub shoud be stored
const entitySubField = "sub"

// field of entity where error shoud be stored
const entityErrorField = "error"

// field of entity where parameters are set
const entityParametersField = "parameters"

// indicate if you use datastore
const useDatastore = true

exports.handler = async event => {
    //eslint-disable-line
    
    let record, newImage, dynamoKey, newParameters, oldImage;
    for (let i = 0; i < event.Records.length; i++) {
        record = event.Records[i];
        dynamoKey = record.dynamodb.Keys.id.S;
        newImage = aws.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);
        oldImage = aws.DynamoDB.Converter.unmarshall(record.dynamodb.OldImage);
        newParameters = newImage[entityParametersField];
        
        if (record.eventName === "INSERT" || (newParameters && newParameters.resend)) {
            const createUserParameters = {
                Username: newImage[userNameField],
                UserPoolId: userPoolId,
                UserAttributes: [
                    {Name: "locale", Value: "fr"},
                    {Name: "custom:entity_id", Value: dynamoKey}
                ]
            };
            
            // set email
            if (emailField && newImage[emailField]) {
                createUserParameters.UserAttributes.push({Name: "email", Value: newImage[emailField]})
                if (newParameters && newParameters.setVerified) {
                    createUserParameters.UserAttributes.push({Name: "email_verified", Value: "true"})
                }
            }
            
            // invitation
            const _invite = newParameters && newParameters.invite  ? newParameters.invite : true;
            if (!_invite)createUserParameters.MessageAction = "SUPPRESS";
            
            // password
            const _password = newParameters && newParameters.tmpPass ? newParameters.tmpPass : false;
            if (_password)createUserParameters.TemporaryPassword = _password
            
            try {
                // perform user creation
                const _insertedUser = await cognitoIdentityServiceProvider.adminCreateUser(createUserParameters).promise();
                
                // if ok
                if (_insertedUser.User.Username) {
                    
                    // adding to group
                    if (record.eventName === "INSERT" && groupToAdd) {
                        const addInGroup = await cognitoIdentityServiceProvider.adminAddUserToGroup({
                            GroupName: groupToAdd,
                            UserPoolId: userPoolId,
                            Username: _insertedUser.User.Username
                        }).promise();
                    }
                    
                    // update db user with sub
                    const _updateUser = await request({
                        query: updateUser,
                        variables: {
                            input: {
                                id: dynamoKey,
                                [entitySubField]: _insertedUser.User.Username,
                                [entityErrorField]: null,
                                [entityParametersField]: null,
                                ...(useDatastore && {_version: newImage._version})
                            }
                        }
                    }, appsyncUrl);
                }
            }
            
            catch (error) {
                const _updateUser = await request({
                    query: updateUser,
                    variables: {
                        input: {
                            id: dynamoKey,
                            [entityErrorField]: JSON.stringify({"error": error}),
                            ...(useDatastore && {_version: newImage._version})
                        }
                    }
                }, appsyncUrl);
                console.log("error when creating user", error);
            }
            
            // attempt to set password as definitive
            try {
                const _def = (newParameters && newParameters.defPass) ? newParameters.defPass : false;
                if (_def) {
                    const _setPasswordParams = {
                        Password: _password,
                        Permanent: true,
                        UserPoolId: userPoolId,
                        Username: newImage[userNameField]
                    }
                    
                    const _setPassword = await cognitoIdentityServiceProvider.AdminSetUserPassword(_setPasswordParams).promise();
                }
            }
            catch (error) {
                console.log("error when set pass", error);
            }
        }
        else if (record.eventName === "REMOVE" || (useDatastore && record.eventName === "MODIFY" && newImage._deleted)) {
            const params = {
                Username: oldImage[userNameField],
                UserPoolId: userPoolId,
            };
            try {
                const _delete = await cognitoIdentityServiceProvider.adminDeleteUser(params).promise();
            }
            catch (error) {
                console.log("error when deleting user", error);
            }
        }
    }
};

function handleError(label, error) {

}