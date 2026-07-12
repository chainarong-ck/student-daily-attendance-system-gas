import type {
    AdminBootstrap,
    AttendanceClassSession,
    AttendanceOverview,
    AttendanceStats,
    AttendanceStatsFilters,
    ClassRoom,
    ForceDeleteStudentsPayload,
    ForceDeleteStudentsResult,
    IndexBootstrap,
    LoginResult,
    PublicSystemState,
    SaveAttendancePayload,
    SaveAttendanceResult,
    SaveAcademicYearsPayload,
    SaveSystemSettingsPayload,
    SetupPayload,
    Student,
    SystemConfig,
} from "./types";

declare global {
    namespace google.script {
        /**
         * เพิ่มเฉพาะฟังก์ชัน Apps Script ที่เรียกได้จาก google.script.run
         */
        interface PublicEndpoints {
            getPublicSystemState(): PublicSystemState;
            setupSystem(payload: SetupPayload): PublicSystemState;
            loginApp(password: string): LoginResult;
            loginAdmin(password: string): LoginResult;
            getIndexBootstrap(token: string): IndexBootstrap;
            getAdminBootstrap(adminToken: string): AdminBootstrap;
            saveSystemSettings(
                adminToken: string,
                payload: SaveSystemSettingsPayload,
            ): SystemConfig;
            saveAcademicYears(
                adminToken: string,
                payload: SaveAcademicYearsPayload,
            ): AdminBootstrap;
            saveClasses(adminToken: string, rows: ClassRoom[]): ClassRoom[];
            saveStudents(
                adminToken: string,
                classId: string,
                rows: Student[],
            ): Student[];
            forceDeleteStudents(
                adminToken: string,
                payload: ForceDeleteStudentsPayload,
            ): ForceDeleteStudentsResult;
            getAttendanceClassSession(
                token: string,
                classId: string,
                date: string,
            ): AttendanceClassSession;
            saveAttendance(
                token: string,
                payload: SaveAttendancePayload,
            ): SaveAttendanceResult;
            updateAttendance(
                token: string,
                payload: SaveAttendancePayload,
            ): SaveAttendanceResult;
            getAttendanceOverview(
                token: string,
                date: string,
            ): AttendanceOverview;
            getAttendanceStats(
                token: string,
                filters: AttendanceStatsFilters,
            ): AttendanceStats;
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
