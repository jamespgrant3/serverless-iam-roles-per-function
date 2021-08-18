"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const index_1 = __importDefault(require("../lib/index"));
const lodash_1 = __importDefault(require("lodash"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
process.env['SLS_DEPRECATION_DISABLE'] = 'CLI_OPTIONS_BEFORE_COMMAND';
const Serverless = require('serverless/lib/Serverless');
const funcWithIamTemplate = require('../../src/test/funcs-with-iam.json');
describe('plugin tests', function () {
    this.timeout(15000);
    let serverless;
    const tempdir = os_1.default.tmpdir();
    before(() => {
        const dir = path_1.default.join(tempdir, '.serverless');
        try {
            fs_1.default.mkdirSync(dir);
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                console.log('failed to create dir: %s, error: ', dir, error);
                throw error;
            }
        }
        const packageFile = path_1.default.join(dir, funcWithIamTemplate.package.artifact);
        fs_1.default.writeFileSync(packageFile, 'test123');
        console.log('### serverless version: %s ###', (new Serverless()).version);
    });
    beforeEach(() => __awaiter(this, void 0, void 0, function* () {
        serverless = new Serverless();
        serverless.cli = new serverless.classes.CLI();
        // Since serverless 2.24.0 processInput function doesn't exist
        if (serverless.cli.processInput) {
            serverless.processedInput = serverless.cli.processInput();
        }
        Object.assign(serverless.service, lodash_1.default.cloneDeep(funcWithIamTemplate));
        serverless.service.provider.compiledCloudFormationTemplate = {
            Resources: {},
            Outputs: {},
        };
        serverless.config.servicePath = tempdir;
        serverless.pluginManager.loadAllPlugins();
        let compileHooks = serverless.pluginManager.getHooks('package:setupProviderConfiguration');
        compileHooks = compileHooks.concat(serverless.pluginManager.getHooks('package:compileFunctions'), serverless.pluginManager.getHooks('package:compileEvents'));
        for (const ent of compileHooks) {
            try {
                yield ent.hook();
            }
            catch (error) {
                console.log('failed running compileFunction hook: [%s] with error: ', ent, error);
                chai_1.assert.fail();
            }
        }
    }));
    /**
     * @param {string} name
     * @param {*} roleNameObj
     * @returns void
     */
    function assertFunctionRoleName(name, roleNameObj) {
        chai_1.assert.isArray(roleNameObj['Fn::Join']);
        chai_1.assert.isTrue(roleNameObj['Fn::Join'][1].toString().indexOf(name) >= 0, 'role name contains function name');
    }
    describe('defaultInherit not set', () => {
        let plugin;
        beforeEach(() => __awaiter(this, void 0, void 0, function* () {
            plugin = new index_1.default(serverless);
        }));
        describe('#constructor()', () => {
            it('should initialize the plugin', () => {
                chai_1.assert.instanceOf(plugin, index_1.default);
            });
            it('should NOT initialize the plugin for non AWS providers', () => {
                chai_1.assert.throws(() => new index_1.default({ service: { provider: { name: 'not-aws' } } }));
            });
            it('defaultInherit should be false', () => {
                chai_1.assert.isFalse(plugin.defaultInherit);
            });
        });
        const statements = [{
                Effect: 'Allow',
                Action: [
                    'xray:PutTelemetryRecords',
                    'xray:PutTraceSegments',
                ],
                Resource: '*',
            }];
        describe('#validateStatements', () => {
            it('should validate valid statement', () => {
                chai_1.assert.doesNotThrow(() => { plugin.validateStatements(statements); });
            });
            it('should throw an error for invalid statement', () => {
                const badStatement = [{
                        Action: [
                            'xray:PutTelemetryRecords',
                            'xray:PutTraceSegments',
                        ],
                        Resource: '*',
                    }];
                chai_1.assert.throws(() => { plugin.validateStatements(badStatement); });
            });
            it('should throw an error for non array type of statement', () => {
                const badStatement = {
                    Action: [
                        'xray:PutTelemetryRecords',
                        'xray:PutTraceSegments',
                    ],
                    Resource: '*',
                };
                chai_1.assert.throws(() => { plugin.validateStatements(badStatement); });
            });
        });
        describe('#getRoleNameLength', () => {
            it('Should calculate the accurate role name length us-east-1', () => {
                serverless.service.provider.region = 'us-east-1';
                const functionName = 'a'.repeat(10);
                const nameParts = [
                    serverless.service.service,
                    serverless.service.provider.stage,
                    { Ref: 'AWS::Region' },
                    functionName,
                    'lambdaRole', // lambdaRole, length 10 : 44
                ];
                const roleNameLength = plugin.getRoleNameLength(nameParts);
                const expected = 44; // 12 + 3 + 9 + 10 + 10 == 44
                chai_1.assert.equal(roleNameLength, expected + nameParts.length - 1);
            });
            it('Should calculate the accurate role name length ap-northeast-1', () => {
                serverless.service.provider.region = 'ap-northeast-1';
                const functionName = 'a'.repeat(10);
                const nameParts = [
                    serverless.service.service,
                    serverless.service.provider.stage,
                    { Ref: 'AWS::Region' },
                    functionName,
                    'lambdaRole', // lambdaRole, length 10
                ];
                const roleNameLength = plugin.getRoleNameLength(nameParts);
                const expected = 49; // 12 + 3 + 14 + 10 + 10 == 49
                chai_1.assert.equal(roleNameLength, expected + nameParts.length - 1);
            });
            it('Should calculate the actual length for a non AWS::Region ref to maintain backward compatibility', () => {
                serverless.service.provider.region = 'ap-northeast-1';
                const functionName = 'a'.repeat(10);
                const nameParts = [
                    serverless.service.service,
                    { Ref: 'bananas' },
                    { Ref: 'AWS::Region' },
                    functionName,
                    'lambdaRole', // lambdaRole, length 10
                ];
                const roleNameLength = plugin.getRoleNameLength(nameParts);
                const expected = 53; // 12 + 7 + 14 + 10 + 10 == 53
                chai_1.assert.equal(roleNameLength, expected + nameParts.length - 1);
            });
        });
        describe('#getFunctionRoleName', () => {
            it('should return a name with the function name', () => {
                const name = 'test-name';
                const roleName = plugin.getFunctionRoleName(name);
                assertFunctionRoleName(name, roleName);
                const nameParts = roleName['Fn::Join'][1];
                chai_1.assert.equal(nameParts[nameParts.length - 1], 'lambdaRole');
            });
            it('should throw an error on long name', () => {
                const longName = 'long-long-long-long-long-long-long-long-long-long-long-long-long-name';
                chai_1.assert.throws(() => { plugin.getFunctionRoleName(longName); });
                try {
                    plugin.getFunctionRoleName(longName);
                }
                catch (error) {
                    // some validation that the error we throw is what we expect
                    const msg = error.message;
                    chai_1.assert.isString(msg);
                    chai_1.assert.isTrue(msg.startsWith('serverless-iam-roles-per-function: ERROR:'));
                    chai_1.assert.isTrue(msg.includes(longName));
                    chai_1.assert.isTrue(msg.endsWith('iamRoleStatementsName.'));
                }
            });
            it('should throw with invalid Fn:Join statement', () => {
                chai_1.assert.throws(() => {
                    const longName = 'test-name';
                    const invalidRoleName = {
                        'Fn::Join': [],
                    };
                    const slsMock = {
                        service: {
                            provider: {
                                name: 'aws',
                            },
                        },
                        providers: {
                            aws: { naming: { getRoleName: () => invalidRoleName } },
                        },
                    };
                    (new index_1.default(slsMock)).getFunctionRoleName(longName);
                });
            });
            it('should return a name without "lambdaRole"', () => {
                let name = 'test-name';
                let roleName = plugin.getFunctionRoleName(name);
                const len = plugin.getRoleNameLength(roleName['Fn::Join'][1]);
                // create a name which causes role name to be longer than 64 chars by 1.
                // Will cause then lambdaRole to be removed
                name += 'a'.repeat(64 - len + 1);
                roleName = plugin.getFunctionRoleName(name);
                assertFunctionRoleName(name, roleName);
                const nameParts = roleName['Fn::Join'][1];
                chai_1.assert.notEqual(nameParts[nameParts.length - 1], 'lambdaRole');
            });
        });
        describe('#createRolesPerFunction', () => {
            it('should create role per function', () => {
                plugin.createRolesPerFunction();
                const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
                const helloRole = compiledResources.HelloIamRoleLambdaExecution;
                chai_1.assert.isNotEmpty(helloRole);
                assertFunctionRoleName('hello', helloRole.Properties.RoleName);
                chai_1.assert.isEmpty(helloRole.Properties.ManagedPolicyArns, 'function resource role has no managed policy');
                // check depends and role is set properly
                const helloFunctionResource = compiledResources.HelloLambdaFunction;
                chai_1.assert.isTrue(helloFunctionResource.DependsOn.indexOf('HelloIamRoleLambdaExecution') >= 0, 'function resource depends on role');
                chai_1.assert.equal(helloFunctionResource.Properties.Role['Fn::GetAtt'][0], 'HelloIamRoleLambdaExecution', 'function resource role is set properly');
                const helloInheritRole = compiledResources.HelloInheritIamRoleLambdaExecution;
                assertFunctionRoleName('helloInherit', helloInheritRole.Properties.RoleName);
                let policyStatements = helloInheritRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(policyStatements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords'), 'global statements imported upon inherit');
                chai_1.assert.isObject(policyStatements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
                const streamHandlerRole = compiledResources.StreamHandlerIamRoleLambdaExecution;
                assertFunctionRoleName('streamHandler', streamHandlerRole.Properties.RoleName);
                policyStatements = streamHandlerRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(policyStatements.find((s) => lodash_1.default.isEqual(s.Action, [
                    'dynamodb:GetRecords',
                    'dynamodb:GetShardIterator',
                    'dynamodb:DescribeStream',
                    'dynamodb:ListStreams'
                ]) &&
                    lodash_1.default.isEqual(s.Resource, [
                        'arn:aws:dynamodb:us-east-1:1234567890:table/test/stream/2017-10-09T19:39:15.151'
                    ])), 'stream statements included');
                chai_1.assert.isObject(policyStatements.find((s) => s.Action[0] === 'sns:Publish'), 'sns dlq statements included');
                const streamMapping = compiledResources.StreamHandlerEventSourceMappingDynamodbTest;
                chai_1.assert.equal(streamMapping.DependsOn, 'StreamHandlerIamRoleLambdaExecution');
                // verify sqsHandler should have SQS permissions
                const sqsHandlerRole = compiledResources.SqsHandlerIamRoleLambdaExecution;
                assertFunctionRoleName('sqsHandler', sqsHandlerRole.Properties.RoleName);
                policyStatements = sqsHandlerRole.Properties.Policies[0].PolicyDocument.Statement;
                JSON.stringify(policyStatements);
                chai_1.assert.isObject(policyStatements.find((s) => lodash_1.default.isEqual(s.Action, [
                    'sqs:ReceiveMessage',
                    'sqs:DeleteMessage',
                    'sqs:GetQueueAttributes'
                ]) &&
                    lodash_1.default.isEqual(s.Resource, [
                        'arn:aws:sqs:us-east-1:1234567890:MyQueue',
                        'arn:aws:sqs:us-east-1:1234567890:MyOtherQueue'
                    ])), 'sqs statements included');
                chai_1.assert.isObject(policyStatements.find((s) => s.Action[0] === 'sns:Publish'), 'sns dlq statements included');
                const sqsMapping = compiledResources.SqsHandlerEventSourceMappingSQSMyQueue;
                chai_1.assert.equal(sqsMapping.DependsOn, 'SqsHandlerIamRoleLambdaExecution');
                // verify helloNoPerFunction should have global role
                const helloNoPerFunctionResource = compiledResources.HelloNoPerFunctionLambdaFunction;
                // role is the default role generated by the framework
                chai_1.assert.isFalse(helloNoPerFunctionResource.DependsOn.indexOf('IamRoleLambdaExecution') === 0, 'function resource depends on global role');
                chai_1.assert.equal(helloNoPerFunctionResource.Properties.Role['Fn::GetAtt'][0], 'IamRoleLambdaExecution', 'function resource role is set to global role');
                // verify helloEmptyIamStatements
                const helloEmptyIamStatementsRole = compiledResources.HelloEmptyIamStatementsIamRoleLambdaExecution;
                assertFunctionRoleName('helloEmptyIamStatements', helloEmptyIamStatementsRole.Properties.RoleName);
                const helloManagedPolicy = helloEmptyIamStatementsRole.Properties.ManagedPolicyArns[0];
                chai_1.assert.isTrue(helloManagedPolicy
                    && helloManagedPolicy['Fn::Join']
                    && helloManagedPolicy['Fn::Join'][1][2] === ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole', 'VPC managed policy is set');
                const helloPermissionsBoundaryIamRole = compiledResources.HelloPermissionsBoundaryIamRoleLambdaExecution;
                const helloPermissionsBoundaryManagedPolicy = helloPermissionsBoundaryIamRole.Properties.ManagedPolicyArns[0];
                chai_1.assert.isUndefined(helloPermissionsBoundaryManagedPolicy, 'VPC managed policy not set');
                const helloEmptyFunctionResource = compiledResources.HelloEmptyIamStatementsLambdaFunction;
                chai_1.assert.isTrue(helloEmptyFunctionResource.DependsOn.indexOf('HelloEmptyIamStatementsIamRoleLambdaExecution') >= 0, 'function resource depends on role');
                chai_1.assert.equal(helloEmptyFunctionResource.Properties.Role['Fn::GetAtt'][0], 'HelloEmptyIamStatementsIamRoleLambdaExecution', 'function resource role is set properly');
            });
            it('should do nothing when no functions defined', () => {
                const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
                serverless.service.functions = {};
                serverless.service.resources = {};
                plugin.createRolesPerFunction();
                for (const key in compiledResources) {
                    if (key !== 'IamRoleLambdaExecution' && Object.prototype.hasOwnProperty.call(compiledResources, key)) {
                        const resource = compiledResources[key];
                        if (resource.Type === 'AWS::IAM::Role') {
                            chai_1.assert.fail(resource, undefined, 'There shouldn\'t be extra roles beyond IamRoleLambdaExecution');
                        }
                    }
                }
            });
            it('should throw when external role is defined', () => {
                lodash_1.default.set(serverless.service, 'functions.hello.role', 'arn:${AWS::Partition}:iam::0123456789:role/Test');
                chai_1.assert.throws(() => {
                    plugin.createRolesPerFunction();
                });
            });
        });
        describe('#throwErorr', () => {
            it('should throw formatted error', () => {
                try {
                    plugin.throwError('msg :%s', 'testing');
                    chai_1.assert.fail('expected error to be thrown');
                }
                catch (error) {
                    const msg = error.message;
                    chai_1.assert.isString(msg);
                    chai_1.assert.isTrue(msg.startsWith('serverless-iam-roles-per-function: ERROR:'));
                    chai_1.assert.isTrue(msg.includes('testing'));
                }
            });
        });
    });
    describe('defaultInherit set', () => {
        let plugin;
        beforeEach(() => {
            // set defaultInherit
            lodash_1.default.set(serverless.service, 'custom.serverless-iam-roles-per-function.defaultInherit', true);
            // change helloInherit to false for testing
            lodash_1.default.set(serverless.service, 'functions.helloInherit.iamRoleStatementsInherit', false);
            plugin = new index_1.default(serverless);
        });
        describe('#constructor()', () => {
            it('defaultInherit should be true', () => {
                chai_1.assert.isTrue(plugin.defaultInherit);
            });
        });
        describe('#createRolesPerFunction', () => {
            it('should create role per function', () => {
                const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
                plugin.createRolesPerFunction();
                const helloRole = compiledResources.HelloIamRoleLambdaExecution;
                chai_1.assert.isNotEmpty(helloRole);
                assertFunctionRoleName('hello', helloRole.Properties.RoleName);
                // check depends and role is set properly
                const helloFunctionResource = compiledResources.HelloLambdaFunction;
                chai_1.assert.isTrue(helloFunctionResource.DependsOn.indexOf('HelloIamRoleLambdaExecution') >= 0, 'function resource depends on role');
                chai_1.assert.equal(helloRole.Properties.ManagedPolicyArns[0], 'arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy', 'function managed policies inherited');
                chai_1.assert.equal(helloFunctionResource.Properties.Role['Fn::GetAtt'][0], 'HelloIamRoleLambdaExecution', 'function resource role is set properly');
                let statements = helloRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords'), 'global statements imported as defaultInherit is set');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
                const helloInheritRole = compiledResources.HelloInheritIamRoleLambdaExecution;
                assertFunctionRoleName('helloInherit', helloInheritRole.Properties.RoleName);
                statements = helloInheritRole.Properties.Policies[0].PolicyDocument.Statement;
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported');
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'global statements not imported as iamRoleStatementsInherit is false');
            });
            it('should add permission policy arn when there is iamPermissionsBoundary defined', () => {
                const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
                plugin.createRolesPerFunction();
                const helloPermissionsBoundaryIamRole = compiledResources.HelloPermissionsBoundaryIamRoleLambdaExecution;
                const policyName = helloPermissionsBoundaryIamRole.Properties.PermissionsBoundary['Fn::Sub'];
                chai_1.assert.equal(policyName, 'arn:aws:iam::xxxxx:policy/your_permissions_boundary_policy');
            });
            it('should add permission policy arn when there is iamGlobalPermissionsBoundary defined', () => {
                const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
                serverless.service.custom['serverless-iam-roles-per-function'] = {
                    iamGlobalPermissionsBoundary: {
                        'Fn::Sub': 'arn:aws:iam::xxxxx:policy/permissions_boundary',
                    },
                };
                plugin.createRolesPerFunction();
                const defaultIamRoleLambdaExecution = compiledResources.IamRoleLambdaExecution;
                const policyName = defaultIamRoleLambdaExecution.Properties.PermissionsBoundary['Fn::Sub'];
                chai_1.assert.equal(policyName, 'arn:aws:iam::xxxxx:policy/permissions_boundary');
            });
        });
    });
    describe('support new provider.iam property', () => {
        const getLambdaTestStatements = () => {
            const plugin = new index_1.default(serverless);
            const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
            plugin.createRolesPerFunction();
            const helloInherit = compiledResources.HelloInheritIamRoleLambdaExecution;
            chai_1.assert.isNotEmpty(helloInherit);
            return helloInherit.Properties.Policies[0].PolicyDocument.Statement;
        };
        it('no global iam, iamRoleStatements and iamManagedPolicies properties', () => {
            lodash_1.default.set(serverless.service, 'provider.iam', undefined);
            lodash_1.default.set(serverless.service, 'provider.iamRoleStatements', undefined);
            lodash_1.default.set(serverless.service, 'provider.iamManagedPolicies', undefined);
            const statements = getLambdaTestStatements();
            chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'provider.iamRoleStatements values shouldn\'t exists');
            chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
        });
        describe('new iam property takes precedence over old iamRoleStatements and iamManagedPolicies property', () => {
            it('empty iam object', () => {
                lodash_1.default.set(serverless.service, 'provider.iam', {});
                const statements = getLambdaTestStatements();
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'provider.iamRoleStatements values shouldn\'t exists');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
            });
            it('no role property', () => {
                lodash_1.default.set(serverless.service, 'provider.iam', {
                    deploymentRole: 'arn:aws:iam::123456789012:role/deploy-role',
                });
                const statements = getLambdaTestStatements();
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'provider.iamRoleStatements values shouldn\'t exists');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
            });
            it('role property set to role ARN', () => {
                lodash_1.default.set(serverless.service, 'provider.iam', {
                    role: 'arn:aws:iam::0123456789:role//my/default/path/roleInMyAccount',
                });
                const statements = getLambdaTestStatements();
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'provider.iamRoleStatements values shouldn\'t exists');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
            });
            it('role is set without statements and with managed policies', () => {
                const customManagedPolicy = 'arn:aws:iam::123456789012:user/*';
                lodash_1.default.set(serverless.service, 'provider.iam', {
                    role: {
                        managedPolicies: [customManagedPolicy],
                    },
                });
                const plugin = new index_1.default(serverless);
                const compiledResources = serverless.service.provider.compiledCloudFormationTemplate.Resources;
                plugin.createRolesPerFunction();
                const helloInherit = compiledResources.HelloInheritIamRoleLambdaExecution;
                chai_1.assert.isNotEmpty(helloInherit);
                const statements = helloInherit.Properties.Policies[0].PolicyDocument.Statement;
                const managedPolicies = helloInherit.Properties.ManagedPolicyArns;
                chai_1.assert.isTrue(managedPolicies.indexOf(customManagedPolicy) === 0, 'function managed policies inherited');
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'provider.iamRoleStatements values shouldn\'t exists');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
            });
            it('empty statements', () => {
                lodash_1.default.set(serverless.service, 'provider.iam', {
                    role: {
                        statements: [],
                    },
                });
                const statements = getLambdaTestStatements();
                chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'provider.iamRoleStatements values shouldn\'t exists');
                chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
            });
        });
        it('global iam role statements exists in lambda role statements', () => {
            lodash_1.default.set(serverless.service, 'provider.iam', {
                role: {
                    statements: [{
                            Effect: 'Allow',
                            Action: [
                                'ec2:CreateNetworkInterface',
                            ],
                            Resource: '*',
                        }],
                },
            });
            const statements = getLambdaTestStatements();
            chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'ec2:CreateNetworkInterface'), 'global iam role statements exists');
            chai_1.assert.isTrue(statements.find((s) => s.Action[0] === 'xray:PutTelemetryRecords') === undefined, 'old provider.iamRoleStatements shouldn\'t exists');
            chai_1.assert.isObject(statements.find((s) => s.Action[0] === 'dynamodb:GetItem'), 'per function statements imported upon inherit');
        });
    });
});
//# sourceMappingURL=index.test.js.map