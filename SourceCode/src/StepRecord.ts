/**
 * StepRecord 记录一次局部推进沉淀下来的最小结果。
 *
 * 当前实现只保留 input / output / change / next 四项最小留痕，
 * 还没有承接 mode 流转、人工等待或完整多轮原始过程。
 * 这意味着它更像“结果快照”，而不是“完整轮次运行日志”。
 */
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
