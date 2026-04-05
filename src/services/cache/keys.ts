export const cacheKeys = {
    user: (id: string) => `user:${id}`,
    organization: (id: string) => `org:${id}`,
    project: (id: string) => `project:${id}`,
    blueprint: (id: string) => `blueprint:${id}`,
    blueprintStatus: (id: string) => `blueprint:status:${id}`,
    subscriptionOrg: (organizationId: string) => `subscription:org:${organizationId}`,
};
