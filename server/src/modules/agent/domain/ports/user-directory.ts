/**
 * domain/ports/user-directory.ts —— 「这个 userId 存在吗」的端口。
 *
 * ★ **形状与 `cabinet` 那份逐字相同,而且是故意的**——组装根因此可以把**同一个**
 *   包一层的函数同时交给两个模块(见 `src/index.ts` 里那个 `userExists`)。
 *
 * ⚠️ **但刻意不复用 cabinet 那个类型**:那会让本模块的 domain 在**编译期**依赖
 *   `cabinet` 的 domain,而本模块的规矩是模块间**零 import**、跨模块协作只经各自
 *   barrel(§7.1)。同 `cosmetic-reader.ts`:每个消费者**自己声明它要的那一片**。
 *   两处形状相同是**结论**,不是抄。这也解释了为什么它不算 `shared` 该收的那类重复:
 *   `zodIssuesMessage` 四份是**同一个实现**抄了四遍,这里两份是**两个消费者各自的声明**。
 *
 * ★ **为什么需要它**(此前是 `README.md` 待办里标着"仍未定"的那一条):
 *   没有它,`POST /agent/sessions` 会为一个**不存在的用户**返回 **201**,
 *   而这个会话此后只会有一种命运——模型一调 `list_cabinet`,`ListCosmetics`
 *   就抛 `USER_NOT_FOUND`(它**刻意不装作"衣橱是空的"**),那个错误按不变量
 *   `[D]`/`[E]` 回填成 observation 喂给模型。
 *   问题是**模型改不了这个错**:它不是"参数写错了",是"这个用户不存在"。
 *   于是循环空转——正是 `validators/validate.ts` 文件头点名的那个成因。
 *   **开局一次 404,比聊到一半再报错诚实得多。**
 *   另:一旦「会话落盘」落地,ghost 会话还会变成盘上的持久记录。
 *
 * ⚠️ **这不是鉴权,别把它当安全边界。** 全项目无令牌(红线 §13-5),
 *   `userId` 本来就是客户端的一句声明——它挡的是**孤儿**(指向不存在用户的记录),
 *   不是冒用。冒用那条风险红线 §13-5 明确接受,本文件不改变它。
 */
export interface UserDirectory {
  /** 用户是否存在。 */
  exists(userId: string): Promise<boolean>;
}
