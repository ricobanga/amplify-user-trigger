# amplify-user-trigger
trigger to handle cognito operations from user entity manipulation

## When to use
In Amplify, you may not want to use admin API to manage your users for various reasons.
You may prefer to handle one or several dedicated users table to store user data.
This is very convenient if you intent to use idToken for security purpose like multi-tenancy, as you will want to keep the exposed jwt as light as possible   

You may have several user tables with different type of users (admin, tenant, client...), each with their own fields and rules

This lambda template is meant to be used as a trigger on ONE user table, and perform user operations.

## requirement

An amplify project with
- A cognito user pool
- A graphql API with
  - A lambda layer to perform graphQL from lambda as described in documentation
        https://docs.amplify.aws/guides/functions/appsync-operations-to-lambda-layer/q/platform/js/
  - a dynamodb user table, typically like this :

```graphql
type AdminUser @model
    @auth(rules: [
        {allow: groups, groups: ["Admin"]},
    ]) {
        id: ID!
        name: String!
        email: AWSEmail   
        firstName: String
        lastName: String
        gender: String
        locale: String
        parameters: AWSJSON # required, tell the trigger what to do
        error: AWSJSON # required, trigger with store error if any
        sub: String # required, trigger will store sub in this field
    }
```

## usage

### Server side

- Create a lambda function with ```amplify add function```
- add access to Auth UserPool
- add appSyncOperation Layer
- copy the script of index.js
- set the given variables from process.env
```js
const userPoolId = process.env.AUTH_<WHATEVER>_USERPOOLID;
const appsyncUrl = process.env.API_<WHATEVER>_GRAPHQLAPIENDPOINTOUTPUT;
```
- edit the variables as explained in comments
```js
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
```

### client side

In the UI, save the user like this :
```js
insert = API.graphql({
    query: insertUser,
    variables: {
        input: {
            firstName: 'john',
            lastName: 'Doe',
            email: 'john.doe@nowhere.com',
            parameters: {
                invite: true,
                tmpPass: "thePassword",
                setVerified: true,
                setDef: true,
            }
        }
    }
})
```
#### parameters

- parameters need at least invite or tmpPass (or both)

| invite | tmpPass | result                                                  |
|--------|---------|---------------------------------------------------------|
| true   | string  | invitation and specified password                       |
| true   | null    | invitation and random password                          |
| false  | string  | no invitation and specified password                    |
| false  | null    | no invitation and random password : should not happen ! |

- setVerified marks the email as verified to avoid annoying code check
- setDef is an attempt to make password definitive (TODO: make it work)

#### tips

aws-exports should contain password policy description

