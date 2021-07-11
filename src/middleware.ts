import { DATA_TYPE, QUERY_OPTION } from "jsstore";

declare var JsStoreEncrypt;



export function jsstoreEncryptMiddleware(request, context) {
    const query = request.query;
    const db = context.database;
    const requestName = request.name;
    const encryptValue = (value: string) => {
        return JsStoreEncrypt.encrypt(value);
    }

    const decryptValue = (value: string) => {
        return JsStoreEncrypt.decrypt(value);
    }

    const getDataType = (value) => {
        if (value == null) {
            return DATA_TYPE.Null;
        }
        const type = typeof value;
        switch (type) {
            case 'object':
                if (Array.isArray(value)) {
                    return DATA_TYPE.Array;
                }
                if (value instanceof Date) {
                    return DATA_TYPE.DateTime;
                }
        }
        return type;
    }

    if (["insert", "update"].indexOf(requestName) >= 0 && query.encrypt) {
        const tableName = requestName === "insert" ? query.into : query.in;
        const table = db.tables.find(q => q.name === tableName);
        const columns = table.columns;
        const encryptInsertValue = (value) => {
            const promises = [];
            const columnNames = [];
            for (const columnName in value) {
                const columnValue = value[columnName];
                if (columnValue != null && columns[columnName].encrypt) {
                    let promiseResult = JsStoreEncrypt.encrypt(columnValue)
                    if (!promiseResult || !promiseResult.then) {
                        promiseResult = Promise.resolve(promiseResult);
                    }
                    columnNames.push(columnName);
                    promises.push(promiseResult);
                }
            }
            return Promise.all(promises).then(columnsValue => {
                let obj = {};
                columnsValue.forEach((item, index) => {
                    obj[columnNames[index]] = item;
                });
                obj = Object.assign(value, obj)
                return obj;
            })
        }
        if (requestName === "insert") {
            return request.beforeExecute(_ => {
                return Promise.all(
                    query.values.map(encryptInsertValue)
                );
            })
        }
        return request.beforeExecute(_ => {
            return encryptInsertValue(query.set);
        })
    }

    function encryptWhere(where: object, columns) {

        const encryptIn = (column) => {
            (where[column][QUERY_OPTION.In] as any[]).forEach((value, i) => {
                where[column][QUERY_OPTION.In][i] = encryptValue(value)
            });
        }

        const checkComparisionOp_ = (column, symbol) => {
            const compareValue = this.where[column][symbol];
            if (symbol != QUERY_OPTION.Between) {
                where[column][symbol] = encryptValue(compareValue);
            }
            else {
                where[column][symbol].low = encryptValue(compareValue.low);
                where[column][symbol].high = encryptValue(compareValue.high);
            }
        }

        for (let columnName in where) {
            const whereColumnValue = where[columnName];
            const column = columns[columnName];
            debugger;
            if (column == null || !column.encrypt) break;

            if (getDataType(whereColumnValue) === "object") {
                for (const key in whereColumnValue) {

                    switch (key) {
                        case QUERY_OPTION.In:
                            encryptIn(columnName);
                            break;
                        case QUERY_OPTION.Between:
                        case QUERY_OPTION.GreaterThan:
                        case QUERY_OPTION.LessThan:
                        case QUERY_OPTION.GreaterThanEqualTo:
                        case QUERY_OPTION.LessThanEqualTo:
                        case QUERY_OPTION.NotEqualTo:
                            checkComparisionOp_(columnName, key);
                    }
                }
            }
            else {
                where[columnName] = encryptValue(whereColumnValue);
            }
        }
    }

    if (requestName === "select") {
        if (!query.decrypt) return;
        const table = db.tables.find(q => q.name === query.from);
        const columns = table.columns;
        const where = query.where;
        if (where) {
            debugger;
            // request.beforeExecute(_ => {
            encryptWhere(where, columns);
            // })
        }
        request.onResult((result) => {
            return Promise.all(
                result.map(function (value) {
                    const promises = [];
                    const columnNames = [];
                    for (const columnName in value) {
                        const columnValue = value[columnName];
                        if (columnValue != null && columns[columnName].encrypt) {
                            let promiseResult = JsStoreEncrypt.decrypt(columnValue)
                            if (!promiseResult || !promiseResult.then) {
                                promiseResult = Promise.resolve(promiseResult);
                            }
                            columnNames.push(columnName);
                            promises.push(promiseResult);
                        }
                    }
                    return Promise.all(promises).then(columnsValue => {
                        let obj = {};
                        columnsValue.forEach((item, index) => {
                            obj[columnNames[index]] = item;
                        });
                        obj = Object.assign(value, obj)
                        return obj;
                    })
                })
            );
        })
    }

};