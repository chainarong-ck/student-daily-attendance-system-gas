declare global {
    namespace google.script {
        /**
         * เพิ่มเฉพาะฟังก์ชัน Apps Script ที่เรียกได้จาก google.script.run
         */
        interface PublicEndpoints {
            TestFunction(): boolean;
        }

        type EndpointsName = keyof PublicEndpoints;

        type EndpointArgs<FunctionName extends EndpointsName> = Parameters<
            PublicEndpoints[FunctionName]
        >;

        type EndpointReturn<FunctionName extends EndpointsName> = ReturnType<
            PublicEndpoints[FunctionName]
        >;

        type EndpointFunctions = {
            [FunctionName in EndpointsName]: (
                ...args: EndpointArgs<FunctionName>
            ) => void;
        };

        interface RunnerFunctions {
            withFailureHandler<UserObject = unknown>(
                handler: (error: Error, object?: UserObject) => void,
            ): Runner;
            withSuccessHandler<
                FnName extends EndpointsName = EndpointsName,
                UserObject = unknown,
            >(
                handler: (
                    value: EndpointReturn<FnName>,
                    object?: UserObject,
                ) => void,
            ): Runner;
            withUserObject<UserObject>(object: UserObject): Runner;
        }

        type Runner = RunnerFunctions & EndpointFunctions;

        const run: Runner;
    }
}

export {};
