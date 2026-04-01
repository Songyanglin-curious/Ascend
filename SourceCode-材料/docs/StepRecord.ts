export interface StepRecord {
    /** Step 唯一标识 */
    id: string;

    /** 关联的 Node */
    nodeId: string;

    /** 本轮输入 */
    input: string;

    /** 本轮输出 */
    output: string;

    /** 本轮造成的变化 */
    change: string;

    /** 本轮形成的下一步 */
    next: string;
}