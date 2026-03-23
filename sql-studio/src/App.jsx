import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const DB_TYPES = ["postgresql","mysql","duckdb","snowflake","databricks","sqlite","bigquery","mssql","clickhouse"];
const DB_PORTS = { postgresql:"5432", mysql:"3306", mssql:"1433", clickhouse:"8123" };
const DB_BADGE = {
  postgresql:"PG", mysql:"MY", duckdb:"DUCK", snowflake:"SF",
  databricks:"DB", sqlite:"SQ", bigquery:"BQ", mssql:"MS", clickhouse:"CH"
};
const DB_COLOR = {
  postgresql:"#1d3a6e:#60a5fa", mysql:"#1a3a2a:#4ade80", duckdb:"#2d1f3d:#c084fc",
  snowflake:"#0f2d4a:#38bdf8", databricks:"#2a1a0e:#fb923c", sqlite:"#1a2a3a:#94a3b8",
  bigquery:"#0a2a1a:#34d399", mssql:"#1a1a3a:#818cf8", clickhouse:"#3a1a0a:#fbbf24"
};

const SPECIAL_TYPES = new Set(["snowflake","databricks","bigquery","duckdb","sqlite"]);

const ICONS = {
  db: (c="#fbbf24") => <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><ellipse cx="8" cy="5" rx="6" ry="2" stroke={c} strokeWidth="1.2"/><path d="M2 5v6c0 1.1 2.7 2 6 2s6-.9 6-2V5" stroke={c} strokeWidth="1.2"/><path d="M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" stroke={c} strokeWidth="1.2"/></svg>,
  schema: (c="#fb923c") => <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><path d="M2 4l6-2 6 2v8l-6 2-6-2V4z" stroke={c} strokeWidth="1.2"/></svg>,
  table: (c="#60a5fa") => <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><rect x="2" y="2" width="12" height="12" rx="1.5" stroke={c} strokeWidth="1.2"/><path d="M2 6h12M6 6v8" stroke={c} strokeWidth="1.2"/></svg>,
  view: (c="#22d3ee") => <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><ellipse cx="8" cy="8" rx="6" ry="3.5" stroke={c} strokeWidth="1.2"/><circle cx="8" cy="8" r="1.5" fill={c}/></svg>,
  sp: (c="#a78bfa") => <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><path d="M4 3h8M4 6h5M4 9h7M4 12h4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/><path d="M11 9l3 3-3 3" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  fn: (c="#6ee7b7") => <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><path d="M5 3c-1 0-2 .9-2 2v2c0 .6-.4 1-1 1s1 .4 1 1v2c0 1.1 1 2 2 2M11 3c1 0 2 .9 2 2v2c0 .6.4 1 1 1s-1 .4-1 1v2c0 1.1-1 2-2 2" stroke={c} strokeWidth="1.2" strokeLinecap="round"/></svg>,
  col: <svg viewBox="0 0 16 16" fill="none" width={12} height={12}><rect x="2" y="2" width="12" height="12" rx="2" stroke="#52525b" strokeWidth="1.1"/><path d="M5 8h6M8 5v6" stroke="#52525b" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  pk: <svg viewBox="0 0 16 16" fill="none" width={12} height={12}><circle cx="6" cy="7" r="3" stroke="#fbbf24" strokeWidth="1.2"/><path d="M9 9l5 5M12 12l1.5-1.5" stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  fk: <svg viewBox="0 0 16 16" fill="none" width={12} height={12}><path d="M3 8h10M10 5l3 3-3 3" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevron: (open) => <svg viewBox="0 0 16 16" fill="none" width={13} height={13} style={{transition:"transform .15s",transform:open?"rotate(90deg)":"rotate(0deg)",flexShrink:0}}><path d="M5 4l4 4-4 4" stroke="#52525b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus: <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  play: <svg viewBox="0 0 16 16" fill="none" width={12} height={12}><path d="M4 2l10 6-10 6V2z" fill="currentColor"/></svg>,
  close: <svg viewBox="0 0 16 16" fill="none" width={10} height={10}><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  save: <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5l-3-3z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v4H5V2M5 9h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  refresh: <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><path d="M2.5 8a5.5 5.5 0 109.5-3.74M11.5 1v3.5H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  download: <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><path d="M8 2v8M5 7l3 3 3-3M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  format: <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><path d="M2 4h12M2 7h8M2 10h10M2 13h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  trash: <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  lineage: <svg viewBox="0 0 16 16" fill="none" width={11} height={11}><circle cx="3" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="13" cy="3" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="13" cy="13" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 7.5L11 4M5 8.5L11 12" stroke="currentColor" strokeWidth="1.1"/></svg>,
  grid: <svg viewBox="0 0 16 16" fill="none" width={15} height={15}><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  bookmarks: <svg viewBox="0 0 16 16" fill="none" width={15} height={15}><path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
};

// ─── MOCK DATABASE STRUCTURE ─────────────────────────────────────────────────

function generateMockDatabases(type, conn) {
  const T = (name, cols, opts={}) => ({ name, cols, ...opts });
  const V = (name, cols) => ({ name, cols });
  const P = (name) => ({ name, cols:[] });
  const F = (name, cols=[]) => ({ name, cols });

  const dbs = {
    postgresql: [
      { name: conn.database||"postgres", schemas: [
        { name:"public", tables:[
            T("users",[{n:"id",t:"int",pk:true},{n:"email",t:"varchar"},{n:"name",t:"varchar"},{n:"created_at",t:"timestamp"},{n:"status",t:"varchar"}]),
            T("orders",[{n:"id",t:"int",pk:true},{n:"user_id",t:"int",fk:true},{n:"total",t:"decimal"},{n:"status",t:"varchar"},{n:"created_at",t:"timestamp"}]),
            T("products",[{n:"id",t:"int",pk:true},{n:"name",t:"varchar"},{n:"price",t:"decimal"},{n:"stock",t:"int"},{n:"category_id",t:"int",fk:true}]),
            T("categories",[{n:"id",t:"int",pk:true},{n:"name",t:"varchar"},{n:"parent_id",t:"int",fk:true}]),
          ],
          views:[V("active_users",[{n:"id",t:"int"},{n:"email",t:"varchar"},{n:"last_login",t:"timestamp"}]),V("order_summary",[{n:"user_id",t:"int"},{n:"total_orders",t:"int"},{n:"total_spent",t:"decimal"}])],
          procedures:[P("upsert_user"),P("archive_old_orders")],
          functions:[F("get_user_balance",[{n:"user_id",t:"int"}]),F("calculate_tax",[{n:"amount",t:"decimal"},{n:"region",t:"varchar"}])],
        },
        { name:"analytics", tables:[
            T("events",[{n:"event_id",t:"uuid",pk:true},{n:"event_type",t:"varchar"},{n:"user_id",t:"int",fk:true},{n:"ts",t:"timestamp"},{n:"props",t:"jsonb"}]),
            T("sessions",[{n:"session_id",t:"uuid",pk:true},{n:"user_id",t:"int",fk:true},{n:"started_at",t:"timestamp"},{n:"duration",t:"int"}]),
            T("pageviews",[{n:"id",t:"bigint",pk:true},{n:"session_id",t:"uuid",fk:true},{n:"url",t:"text"},{n:"ts",t:"timestamp"}]),
          ],
          views:[V("daily_active_users",[{n:"date",t:"date"},{n:"dau",t:"int"}])],
          procedures:[], functions:[],
        },
      ]},
      { name:"staging", schemas:[{ name:"public",
        tables:[T("raw_events",[{n:"id",t:"bigint",pk:true},{n:"data",t:"jsonb"},{n:"received_at",t:"timestamp"}]),T("raw_users",[{n:"id",t:"bigint",pk:true},{n:"payload",t:"jsonb"},{n:"source",t:"varchar"}])],
        views:[], procedures:[], functions:[],
      }]},
    ],
    mysql: [{ name: conn.database||"mydb", schemas:null,
      tables:[T("customers",[{n:"id",t:"INT",pk:true},{n:"name",t:"VARCHAR"},{n:"email",t:"VARCHAR"},{n:"phone",t:"VARCHAR"},{n:"created_at",t:"DATETIME"}]),T("invoices",[{n:"id",t:"INT",pk:true},{n:"customer_id",t:"INT",fk:true},{n:"amount",t:"DECIMAL"},{n:"due_date",t:"DATE"},{n:"paid",t:"TINYINT"}]),T("products",[{n:"id",t:"INT",pk:true},{n:"sku",t:"VARCHAR"},{n:"name",t:"VARCHAR"},{n:"price",t:"DECIMAL"},{n:"qty",t:"INT"}])],
      views:[V("unpaid_invoices",[{n:"id",t:"INT"},{n:"customer_id",t:"INT"},{n:"amount",t:"DECIMAL"}])],
      procedures:[P("sp_process_payment"),P("sp_generate_report")],
      functions:[F("fn_tax_amount",[{n:"subtotal",t:"DECIMAL"}])],
    }],
    snowflake: [
      { name:"DEMO_DB", schemas:[{ name:"PUBLIC",
        tables:[T("CUSTOMERS",[{n:"CUSTOMER_ID",t:"NUMBER",pk:true},{n:"NAME",t:"VARCHAR"},{n:"REGION",t:"VARCHAR"},{n:"SIGNUP_DATE",t:"DATE"}]),T("SALES",[{n:"SALE_ID",t:"NUMBER",pk:true},{n:"CUSTOMER_ID",t:"NUMBER",fk:true},{n:"AMOUNT",t:"FLOAT"},{n:"SALE_DATE",t:"DATE"}]),T("PRODUCTS",[{n:"PRODUCT_ID",t:"NUMBER",pk:true},{n:"NAME",t:"VARCHAR"},{n:"PRICE",t:"FLOAT"},{n:"CATEGORY",t:"VARCHAR"}])],
        views:[V("MONTHLY_SALES",[{n:"MONTH",t:"DATE"},{n:"TOTAL",t:"FLOAT"}])],
        procedures:[P("SP_REFRESH_SUMMARY")], functions:[F("CALC_DISCOUNT",[{n:"AMOUNT",t:"FLOAT"},{n:"TIER",t:"VARCHAR"}])],
      }]},
      { name:"RAW_DATA", schemas:[{ name:"PUBLIC", tables:[T("EVENTS",[{n:"ID",t:"NUMBER",pk:true},{n:"DATA",t:"VARIANT"},{n:"LOADED_AT",t:"TIMESTAMP_LTZ"}])], views:[], procedures:[], functions:[] }]},
    ],
    databricks: [{ name:"hive_metastore", schemas:[{ name:"default",
      tables:[T("delta_table",[{n:"id",t:"long",pk:true},{n:"value",t:"string"},{n:"ts",t:"timestamp"}]),T("bronze_events",[{n:"event_id",t:"string",pk:true},{n:"raw",t:"string"},{n:"ingest_ts",t:"timestamp"}]),T("silver_users",[{n:"user_id",t:"long",pk:true},{n:"email",t:"string"},{n:"updated_at",t:"timestamp"}])],
      views:[V("gold_summary",[{n:"user_id",t:"long"},{n:"event_count",t:"long"}])],
      procedures:[], functions:[F("parse_json_field",[{n:"json_str",t:"string"},{n:"key",t:"string"}])],
    }]}],
    duckdb: [{ name: conn.specialValue||":memory:", schemas:[{ name:"main",
      tables:[T("my_table",[{n:"id",t:"INTEGER",pk:true},{n:"value",t:"VARCHAR"},{n:"created",t:"TIMESTAMP"}])],
      views:[V("my_view",[{n:"id",t:"INTEGER"},{n:"value",t:"VARCHAR"}])],
      procedures:[], functions:[F("read_parquet",[{n:"file",t:"VARCHAR"}])],
    }]}],
    mssql: [{ name: conn.database||"master", schemas:[{ name:"dbo",
      tables:[T("Employees",[{n:"EmployeeID",t:"INT",pk:true},{n:"FirstName",t:"NVARCHAR"},{n:"LastName",t:"NVARCHAR"},{n:"DeptID",t:"INT",fk:true},{n:"HireDate",t:"DATE"}]),T("Departments",[{n:"DeptID",t:"INT",pk:true},{n:"Name",t:"NVARCHAR"},{n:"ManagerID",t:"INT",fk:true}]),T("Salaries",[{n:"ID",t:"INT",pk:true},{n:"EmployeeID",t:"INT",fk:true},{n:"Amount",t:"MONEY"},{n:"EffDate",t:"DATE"}])],
      views:[V("vw_EmployeeDetails",[{n:"EmployeeID",t:"INT"},{n:"FullName",t:"NVARCHAR"},{n:"DeptName",t:"NVARCHAR"}])],
      procedures:[P("usp_GetEmployees"),P("usp_UpdateSalary")],
      functions:[F("fn_GetAge",[{n:"birthdate",t:"DATE"}])],
    }]}],
    clickhouse: [{ name: conn.database||"default", schemas:null,
      tables:[T("hits",[{n:"EventDate",t:"Date",pk:true},{n:"UserID",t:"UInt64"},{n:"URL",t:"String"},{n:"PageViews",t:"UInt32"}]),T("visits",[{n:"StartDate",t:"Date",pk:true},{n:"CounterID",t:"UInt32"},{n:"Duration",t:"UInt32"}])],
      views:[V("daily_hits",[{n:"date",t:"Date"},{n:"total",t:"UInt64"}])],
      procedures:[], functions:[],
    }],
    sqlite: [{ name: conn.specialValue||"main", schemas:null,
      tables:[T("notes",[{n:"id",t:"INTEGER",pk:true},{n:"title",t:"TEXT"},{n:"body",t:"TEXT"},{n:"created_at",t:"TEXT"}]),T("tags",[{n:"id",t:"INTEGER",pk:true},{n:"name",t:"TEXT"}]),T("note_tags",[{n:"note_id",t:"INTEGER",fk:true},{n:"tag_id",t:"INTEGER",fk:true}])],
      views:[], procedures:[], functions:[],
    }],
    bigquery: [{ name: conn.specialValue||"my-project", schemas:[{ name:"dataset_analytics",
      tables:[T("events",[{n:"event_id",t:"STRING",pk:true},{n:"user_id",t:"STRING"},{n:"event_name",t:"STRING"},{n:"ts",t:"TIMESTAMP"}]),T("users",[{n:"user_id",t:"STRING",pk:true},{n:"email",t:"STRING"},{n:"country",t:"STRING"}])],
      views:[V("funnel_summary",[{n:"step",t:"STRING"},{n:"count",t:"INT64"}])],
      procedures:[P("proc_refresh_funnel")], functions:[F("parse_utm",[{n:"url",t:"STRING"}])],
    }]}],
  };
  return dbs[type] || [{ name: conn.database||"default", schemas:null, tables:[], views:[], procedures:[], functions:[] }];
}

// ─── QUERY SIMULATOR ─────────────────────────────────────────────────────────

function simulateQuery(sql) {
  const clean = sql.replace(/--[^\n]*/g,"").replace(/\/\*[\s\S]*?\*\//g,"").replace(/\s+/g," ").trim();
  const upper = clean.toUpperCase();

  if (/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|MERGE)\b/.test(upper))
    return { columns:["affected_rows"], rows:[[Math.floor(Math.random()*10)+1]] };
  if (/^SELECT\s+1(\s*\+\s*1)?/.test(upper))
    return { columns:["result"], rows:[[upper.includes("+")?2:1]] };
  if (/SELECT\s+(NOW|CURRENT_TIMESTAMP|CURRENT_DATE|GETDATE)\s*\(/.test(upper))
    return { columns:["now"], rows:[[new Date().toISOString()]] };
  if (/SHOW\s+(TABLES|DATABASES)/.test(upper))
    return { columns:["name","type","schema"], rows:[["users","TABLE","public"],["orders","TABLE","public"],["products","TABLE","public"],["events","TABLE","analytics"]] };
  if (/^(DESCRIBE|DESC )\s+\w+/.test(upper)||upper.includes("INFORMATION_SCHEMA"))
    return { columns:["column_name","data_type","nullable","default"], rows:[["id","integer","NO",null],["email","varchar(255)","NO",null],["name","varchar(100)","YES",null],["created_at","timestamp","YES","now()"],["status","varchar(50)","YES","active"]] };

  const fromM = upper.match(/\bFROM\s+(?:`?[\w]+`?\.)?`?(\w+)`?/);
  const primary = fromM ? fromM[1] : null;
  const joinRe = /\bJOIN\s+(?:`?[\w]+`?\.)?`?(\w+)`?/g;
  const joins = []; let jm;
  while((jm=joinRe.exec(upper))!==null) joins.push(jm[1]);

  const rnd = (min,max) => Math.floor(Math.random()*(max-min+1))+min;
  const rndF = (min,max,d=2) => (Math.random()*(max-min)+min).toFixed(d);
  const rndDate = (daysBack) => new Date(Date.now()-daysBack*86400000).toISOString().split("T")[0];

  if (primary==="USERS"||primary==="PUBLIC") {
    if (joins.includes("ORDERS"))
      return { columns:["user_id","email","name","order_id","total","status"], rows:Array.from({length:15},(_,i)=>[rnd(1,8),`user${rnd(1,8)}@ex.com`,["Alice","Bob","Carol","Dave","Eve","Frank","Grace","Hank"][i%8],i+1,rndF(10,500),["pending","shipped","delivered","cancelled"][i%4]]) };
    return { columns:["id","email","name","created_at","status"], rows:Array.from({length:12},(_,i)=>[i+1,`user${i+1}@example.com`,["Alice","Bob","Carol","Dave","Eve","Frank","Grace","Hank","Iris","Jack","Kate","Leo"][i],rndDate(i*30),i%3===0?"inactive":"active"]) };
  }
  if (primary==="ORDERS") {
    if (joins.includes("USERS"))
      return { columns:["order_id","user_email","total","status","created_at"], rows:Array.from({length:20},(_,i)=>[i+1,`user${rnd(1,8)}@example.com`,rndF(10,500),["pending","shipped","delivered","cancelled"][i%4],rndDate(i*7)]) };
    return { columns:["id","user_id","total","status","created_at"], rows:Array.from({length:20},(_,i)=>[i+1,rnd(1,12),rndF(10,500),["pending","shipped","delivered","cancelled"][i%4],rndDate(i*7)]) };
  }
  if (primary==="PRODUCTS"||primary==="PRODUCT")
    return { columns:["id","name","price","stock","category"], rows:[[1,"Wireless Headphones",79.99,145,"Electronics"],[2,"Coffee Mug",14.99,302,"Kitchen"],[3,"Desk Lamp",39.99,88,"Office"],[4,"Notebook",8.99,500,"Stationery"],[5,"USB Hub",24.99,0,"Electronics"],[6,"Standing Desk",349.00,12,"Office"],[7,"Webcam HD",59.99,74,"Electronics"]] };
  if (primary==="EVENTS")
    return { columns:["event_id","event_type","user_id","ts","props"], rows:Array.from({length:18},(_,i)=>[`evt-${rnd(1000,9999)}`,["page_view","click","sign_up","purchase","logout"][i%5],rnd(1,20),new Date(Date.now()-i*3600000).toISOString(),JSON.stringify({source:["web","mobile","api"][i%3]})]) };
  if (primary==="SESSIONS")
    return { columns:["session_id","user_id","started_at","duration_s","pages"], rows:Array.from({length:10},(_,i)=>[`sess-${i+1}`,rnd(1,20),new Date(Date.now()-i*7200000).toISOString(),rnd(30,600),rnd(1,10)]) };
  if (primary==="CUSTOMERS"||primary==="CUSTOMER")
    return { columns:["id","name","email","region","signup_date"], rows:Array.from({length:10},(_,i)=>[i+1,`Customer ${i+1}`,`cust${i+1}@corp.com`,["APAC","EMEA","AMER","LATAM"][i%4],rndDate(i*60)]) };
  if (primary==="SALES"||primary==="INVOICES")
    return { columns:["id","customer_id","amount","currency","date","status"], rows:Array.from({length:14},(_,i)=>[i+1,rnd(1,10),rndF(100,5000),"USD",rndDate(i*14),["paid","pending","overdue","void"][i%4]]) };
  if (primary==="EMPLOYEES")
    return { columns:["EmployeeID","FirstName","LastName","DeptID","HireDate","Salary"], rows:Array.from({length:8},(_,i)=>[i+1,["Alice","Bob","Carol","Dave","Eve","Frank","Grace","Hank"][i],["Smith","Jones","Williams","Brown","Taylor","Wilson","Moore","Lee"][i],rnd(1,5),rndDate(365*rnd(1,8)),rnd(50000,140000)]) };
  if (primary==="HITS")
    return { columns:["EventDate","UserID","URL","PageViews","UniqUsers"], rows:Array.from({length:10},(_,i)=>[rndDate(i),rnd(1000,99999),["/home","/products","/about","/checkout","/blog"][i%5],rnd(100,10000),rnd(50,5000)]) };
  if (["ACTIVE_USERS","VW_EMPLOYEEDETAILS"].includes(primary))
    return { columns:["id","email","last_login","days_active"], rows:Array.from({length:8},(_,i)=>[i+1,`active${i+1}@example.com`,rndDate(i*2),rnd(1,365)]) };
  if (["ORDER_SUMMARY","MONTHLY_SALES"].includes(primary))
    return { columns:["user_id","total_orders","total_spent","last_order"], rows:Array.from({length:10},(_,i)=>[i+1,rnd(1,20),rndF(100,5000),rndDate(i*15)]) };
  if (primary==="DAILY_ACTIVE_USERS")
    return { columns:["date","dau","new_users","returning"], rows:Array.from({length:14},(_,i)=>[rndDate(i),rnd(100,500),rnd(5,50),rnd(80,450)]) };

  // Generic fallback for any unknown table
  if (primary) {
    const colName = primary.toLowerCase().replace(/s$/, "");
    return { columns:["id",colName+"_name","value","created_at","updated_at"],
      rows:Array.from({length:rnd(5,15)},(_,i)=>[i+1,`${colName}_${i+1}`,rndF(1,1000),rndDate(i*7),rndDate(i)]) };
  }
  return { columns:["result"], rows:[["Query executed successfully"]] };
}

// ─── LINEAGE PARSER ──────────────────────────────────────────────────────────

const VIEW_LINEAGE = {
  "ACTIVE_USERS":["users"],"ORDER_SUMMARY":["orders","users"],"MONTHLY_SALES":["SALES","PRODUCTS"],
  "GOLD_SUMMARY":["silver_users","bronze_events"],"DAILY_HITS":["hits"],"FUNNEL_SUMMARY":["events","users"],
  "DAILY_ACTIVE_USERS":["events","sessions","users"],"VW_EMPLOYEEDETAILS":["Employees","Departments"],
  "UNPAID_INVOICES":["invoices","customers"],"MY_VIEW":["my_table"],
};

function parseLineage(sql, connId, connections) {
  const nodes = {}, edges = [];
  const conn = connections.find(c=>c.id===connId);
  const knownViews = new Set();
  const tableColMap = {};
  if (conn) {
    (conn.databases||[]).forEach(db=>{
      const schemas = db.schemas ? db.schemas : [{tables:db.tables||[],views:db.views||[]}];
      schemas.forEach(s=>{
        (s.views||[]).forEach(v=>{ knownViews.add(v.name.toUpperCase()); tableColMap[v.name.toUpperCase()]=v.cols||[]; });
        (s.tables||[]).forEach(t=>{ tableColMap[t.name.toUpperCase()]=t.cols||[]; });
      });
    });
  }
  const cteNames = new Set();
  const withBlock = sql.match(/WITH\s+([\s\S]+?)(?=\s+SELECT\s+(?!.*\bAS\b\s*\())/i);
  if (withBlock) { const re=/(\w+)\s+AS\s*\(/gi; let m; while((m=re.exec(withBlock[0]))!==null) cteNames.add(m[1].toUpperCase()); }

  const tableRefs = [];
  const re=/(?:FROM|JOIN)\s+([`"]?[\w.]+[`"]?)(?:\s+(?:AS\s+)?\w+)?/gi; let m;
  while((m=re.exec(sql))!==null){
    const raw=m[1].replace(/[`"]/g,""); const parts=raw.split(".");
    const name=parts[parts.length-1].toUpperCase(), schema=parts.length>1?parts[parts.length-2].toUpperCase():null;
    tableRefs.push({name,schema,full:raw.toUpperCase()});
  }
  const primaryM=sql.match(/(?:FROM|UPDATE|INTO)\s+([`"]?[\w.]+[`"]?)/i);
  const primaryTable=primaryM?primaryM[1].replace(/[`"]/g,"").split(".").pop().toUpperCase():null;

  tableRefs.forEach(ref=>{
    const t=ref.name, isCTE=cteNames.has(t), isView=knownViews.has(t), isPrimary=t===primaryTable;
    const type=isCTE?"cte":isView?"view":isPrimary?"target":"source";
    nodes[t]={id:t,label:ref.full.includes(".")?ref.full:t,type,cols:tableColMap[t]||[],schema:ref.schema};
    const vSources=VIEW_LINEAGE[t];
    if(vSources) vSources.forEach(src=>{
      const su=src.toUpperCase();
      if(!nodes[su]) nodes[su]={id:su,label:src,type:"source",cols:tableColMap[su]||[]};
      edges.push({from:su,to:t,label:"source of"});
    });
  });
  if(primaryTable&&tableRefs.length>1){
    tableRefs.forEach(ref=>{
      if(ref.name!==primaryTable&&!cteNames.has(ref.name)&&!edges.find(e=>e.to===primaryTable&&e.from===ref.name))
        edges.push({from:ref.name,to:primaryTable,label:"joined"});
    });
  }
  const ns=Object.values(nodes);
  return ns.length?{nodes:ns,edges,primaryTable}:null;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  :root {
    --bg0:#0a0a0b; --bg1:#111113; --bg2:#18181b; --bg3:#1e1e22; --bg4:#27272c;
    --border:#2e2e35; --border2:#3f3f48;
    --t0:#fafafa; --t1:#a1a1aa; --t2:#71717a; --t3:#52525b;
    --accent:#6ee7b7; --red:#f87171; --yellow:#fbbf24; --blue:#60a5fa;
    --purple:#a78bfa; --orange:#fb923c; --cyan:#22d3ee;
    --font:'Geist',system-ui,sans-serif;
    --mono:'Berkeley Mono','Fira Code',monospace;
    --r:6px;
  }
  body { font-family:var(--font); background:var(--bg0); color:var(--t0); height:100vh; overflow:hidden; font-size:13px; }
  button { cursor:pointer; font-family:var(--font); }
  select,input { font-family:var(--font); }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:var(--bg4); border-radius:3px; }
  .icon-btn { width:28px; height:28px; background:none; border:1px solid transparent; border-radius:var(--r); color:var(--t2); display:flex; align-items:center; justify-content:center; transition:all .15s; }
  .icon-btn:hover { background:var(--bg3); border-color:var(--border); color:var(--t1); }
  .icon-btn svg { pointer-events:none; }
  .spinner { width:13px; height:13px; border:2px solid var(--bg4); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
  @keyframes slideIn { from{transform:translateX(16px);opacity:0} to{transform:none;opacity:1} }
  .toast { animation:slideIn .2s ease; }
  .fade-in { animation:fadeIn .15s ease; }
`;

// ─── TREE NODE ────────────────────────────────────────────────────────────────

function TreeNode({ icon, label, labelColor, badge, badgeColor, indent=0, children, onCtx, onClick, isLeaf=false }) {
  const [open, setOpen] = useState(false);
  const pl = indent*14+8;
  return (
    <div>
      <div
        onContextMenu={onCtx}
        onClick={()=>{ if(!isLeaf){ setOpen(o=>!o); onClick&&onClick(); } else { onClick&&onClick(); }}}
        style={{ display:"flex", alignItems:"center", gap:5, padding:`3.5px 10px 3.5px ${pl}px`, cursor:isLeaf?"default":"pointer", userSelect:"none", transition:"background .1s" }}
        onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}
        onMouseLeave={e=>e.currentTarget.style.background=""}
      >
        {!isLeaf && ICONS.chevron(open)}
        {icon}
        <span style={{ flex:1, fontSize:12, color:labelColor||"var(--t1)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</span>
        {badge!=null&&badge!==""&&<span style={{ fontSize:10, color:badgeColor||"var(--t3)", fontFamily:"var(--mono)" }}>{badge}</span>}
      </div>
      {!isLeaf && open && <div>{children}</div>}
    </div>
  );
}

// ─── LINEAGE CANVAS ──────────────────────────────────────────────────────────

function LineageCanvas({ graph }) {
  const canvasRef = useRef();
  const stateRef = useRef({ scale:1, ox:0, oy:0, dragging:false, lx:0, ly:0 });

  const NODE_W=160, NODE_H=58, H_GAP=110, V_GAP=28;

  const layout = useMemo(()=>{
    if(!graph) return null;
    const {nodes,edges} = graph;
    const inDeg={}, adj={};
    nodes.forEach(n=>{ inDeg[n.id]=0; adj[n.id]=[]; });
    edges.forEach(e=>{ inDeg[e.to]=(inDeg[e.to]||0)+1; (adj[e.from]=adj[e.from]||[]).push(e.to); });
    const layers=[]; const visited=new Set();
    let cur=nodes.filter(n=>!(inDeg[n.id]>0)).map(n=>n.id);
    if(!cur.length) cur=[nodes[0]?.id].filter(Boolean);
    while(cur.length){
      layers.push([...cur]); cur.forEach(id=>visited.add(id));
      const next=[]; cur.forEach(id=>(adj[id]||[]).forEach(c=>{ if(!visited.has(c)&&!next.includes(c)) next.push(c); }));
      cur=next;
    }
    nodes.forEach(n=>{ if(!visited.has(n.id)){ if(!layers.length) layers.push([]); layers[layers.length-1].push(n.id); }});
    const pos={};
    layers.forEach((layer,li)=>{
      const totalH=layer.length*NODE_H+(layer.length-1)*V_GAP;
      layer.forEach((id,ni)=>{ pos[id]={ x:li*(NODE_W+H_GAP)+20, y:ni*(NODE_H+V_GAP)-totalH/2 }; });
    });
    const allY=Object.values(pos).map(p=>p.y); const minY=Math.min(...allY);
    Object.values(pos).forEach(p=>p.y-=minY-20);
    return pos;
  },[graph]);

  const draw = useCallback(()=>{
    const canvas=canvasRef.current; if(!canvas||!graph||!layout) return;
    const ctx=canvas.getContext("2d"), dpr=window.devicePixelRatio||1;
    const {scale,ox,oy}=stateRef.current;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.scale(dpr,dpr); ctx.translate(ox,oy); ctx.scale(scale,scale);
    // dots
    ctx.fillStyle="#27272c";
    for(let x=-200;x<3000;x+=30) for(let y=-200;y<2000;y+=30){ ctx.beginPath(); ctx.arc(x,y,.8,0,Math.PI*2); ctx.fill(); }
    // edges
    graph.edges.forEach(e=>{
      const f=layout[e.from], t=layout[e.to]; if(!f||!t) return;
      const x1=f.x+NODE_W, y1=f.y+NODE_H/2, x2=t.x, y2=t.y+NODE_H/2, cx=(x1+x2)/2;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.bezierCurveTo(cx,y1,cx,y2,x2,y2);
      ctx.strokeStyle="#3f3f48"; ctx.lineWidth=1.5; ctx.stroke();
      const ang=Math.atan2(y2-y1,x2-cx), al=8;
      ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-al*Math.cos(ang-.4),y2-al*Math.sin(ang-.4)); ctx.lineTo(x2-al*Math.cos(ang+.4),y2-al*Math.sin(ang+.4)); ctx.closePath();
      ctx.fillStyle="#52525b"; ctx.fill();
      if(e.label){ ctx.font="9px var(--mono)"; ctx.fillStyle="#52525b"; ctx.textAlign="center"; ctx.fillText(e.label,cx,(y1+y2)/2-4); }
    });
    // nodes
    const COLORS={ target:{bg:"#0f2a1a",bd:"#6ee7b7",tx:"#6ee7b7",lbl:"TARGET"}, source:{bg:"#0f1a2e",bd:"#60a5fa",tx:"#93c5fd",lbl:"TABLE"}, view:{bg:"#1a1030",bd:"#a78bfa",tx:"#c4b5fd",lbl:"VIEW"}, cte:{bg:"#1a2010",bd:"#84cc16",tx:"#bef264",lbl:"CTE"} };
    graph.nodes.forEach(n=>{
      const pos=layout[n.id]; if(!pos) return;
      const {x,y}=pos, c=COLORS[n.type]||COLORS.source;
      ctx.shadowColor=c.bd+"40"; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.roundRect(x,y,NODE_W,NODE_H,6); ctx.fillStyle=c.bg; ctx.fill();
      ctx.strokeStyle=c.bd; ctx.lineWidth=1.5; ctx.stroke(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.roundRect(x,y,NODE_W,3,[6,6,0,0]); ctx.fillStyle=c.bd; ctx.fill();
      ctx.font="bold 8px var(--mono)"; ctx.fillStyle=c.bd; ctx.textAlign="left"; ctx.fillText(c.lbl,x+8,y+16);
      let lbl=n.label; ctx.font="bold 12px var(--mono)"; ctx.fillStyle=c.tx;
      while(ctx.measureText(lbl).width>NODE_W-16&&lbl.length>4) lbl=lbl.slice(0,-1);
      if(lbl!==n.label) lbl+="…"; ctx.fillText(lbl,x+8,y+32);
      if(n.schema){ ctx.font="9px var(--mono)"; ctx.fillStyle="#52525b"; ctx.fillText(n.schema+".",x+8,y+46); }
      if(n.cols?.length){ const pill=`${n.cols.length} cols`; ctx.font="9px var(--mono)"; const pw=ctx.measureText(pill).width+10;
        ctx.beginPath(); ctx.roundRect(x+NODE_W-pw-6,y+NODE_H-16,pw,12,3); ctx.fillStyle=c.bg; ctx.fill();
        ctx.fillStyle=c.tx; ctx.fillText(pill,x+NODE_W-pw-1,y+NODE_H-6); }
    });
    ctx.restore();
  },[graph,layout]);

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas||!graph||!layout) return;
    const rect=canvas.parentElement.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
    canvas.style.width=rect.width+"px"; canvas.style.height=rect.height+"px";
    const allPos=Object.values(layout), cW=Math.max(...allPos.map(p=>p.x))+NODE_W+40, cH=Math.max(...allPos.map(p=>p.y))+NODE_H+40;
    const sc=Math.min(rect.width/cW,rect.height/cH,1.4)*.9;
    stateRef.current.scale=sc; stateRef.current.ox=(rect.width-cW*sc)/2; stateRef.current.oy=(rect.height-cH*sc)/2;
    draw();
  },[graph,layout,draw]);

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const onDown=e=>{ stateRef.current.dragging=true; stateRef.current.lx=e.clientX; stateRef.current.ly=e.clientY; };
    const onMove=e=>{ if(!stateRef.current.dragging) return; stateRef.current.ox+=e.clientX-stateRef.current.lx; stateRef.current.oy+=e.clientY-stateRef.current.ly; stateRef.current.lx=e.clientX; stateRef.current.ly=e.clientY; draw(); };
    const onUp=()=>{ stateRef.current.dragging=false; };
    const onWheel=e=>{ e.preventDefault(); stateRef.current.scale=Math.max(.2,Math.min(3,stateRef.current.scale*(e.deltaY<0?1.1:.9))); draw(); };
    canvas.addEventListener("mousedown",onDown); document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",onUp); canvas.addEventListener("wheel",onWheel,{passive:false});
    return ()=>{ canvas.removeEventListener("mousedown",onDown); document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); canvas.removeEventListener("wheel",onWheel); };
  },[draw]);

  if(!graph) return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"var(--t3)" }}>
      <svg viewBox="0 0 24 24" fill="none" width={32} height={32} style={{opacity:.4}}><circle cx="4" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="20" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="20" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 11L17.5 6M6.5 13L17.5 18" stroke="currentColor" strokeWidth="1.5"/></svg>
      <p style={{fontSize:12}}>Run a query on a table or view to see its lineage</p>
    </div>
  );
  return (
    <div style={{ position:"relative", width:"100%", height:"100%" }}>
      <canvas ref={canvasRef} style={{ display:"block", cursor:"grab" }}/>
      <div style={{ position:"absolute",bottom:12,right:12,display:"flex",gap:6 }}>
        {[["＋",1.2],["－",0.8],["⊞",null]].map(([lbl,f])=>(
          <button key={lbl} className="icon-btn" style={{background:"var(--bg2)",borderColor:"var(--border)",width:28,height:28,fontSize:14}}
            onClick={()=>{ if(f){ stateRef.current.scale=Math.max(.2,Math.min(3,stateRef.current.scale*f)); draw(); } else { const canvas=canvasRef.current; if(!canvas||!layout) return; const rect=canvas.parentElement.getBoundingClientRect(); const allPos=Object.values(layout); const cW=Math.max(...allPos.map(p=>p.x))+NODE_W+40, cH=Math.max(...allPos.map(p=>p.y))+NODE_H+40; const sc=Math.min(rect.width/cW,rect.height/cH)*.9; stateRef.current.scale=sc; stateRef.current.ox=(rect.width-cW*sc)/2; stateRef.current.oy=(rect.height-cH*sc)/2; draw(); }}}
          >{lbl}</button>
        ))}
      </div>
      <div style={{ position:"absolute",top:10,left:10,background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:6,padding:"6px 12px",fontSize:11,color:"var(--t2)",display:"flex",gap:12,alignItems:"center" }}>
        {[["#1d3a6e","#60a5fa","Source Table"],["#1a3a2a","#6ee7b7","Queried Table"],["#1a1030","#a78bfa","View / CTE"]].map(([bg,bd,lbl])=>(
          <span key={lbl} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:2,background:bg,border:`1px solid ${bd}`,display:"inline-block"}}/>{lbl}</span>
        ))}
      </div>
    </div>
  );
}

// ─── RESULTS TABLE ────────────────────────────────────────────────────────────

function ResultsTable({ columns, rows }) {
  const isNum = v => typeof v==="number"||(typeof v==="string"&&v!==""&&!isNaN(v));
  const isDate = v => typeof v==="string"&&/\d{4}-\d{2}-\d{2}/.test(v);
  const isBool = v => v===true||v===false||v==="true"||v==="false";
  return (
    <table style={{ width:"max-content",minWidth:"100%",borderCollapse:"collapse",fontFamily:"var(--mono)",fontSize:12 }}>
      <thead>
        <tr style={{ position:"sticky",top:0,background:"var(--bg2)",zIndex:1 }}>
          {columns.map(c=>(
            <th key={c} style={{ padding:"7px 14px",textAlign:"left",fontWeight:600,color:"var(--t2)",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",whiteSpace:"nowrap",fontSize:11,letterSpacing:".03em" }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row,ri)=>(
          <tr key={ri} onMouseEnter={e=>Array.from(e.currentTarget.cells).forEach(c=>c.style.background="var(--bg2)")} onMouseLeave={e=>Array.from(e.currentTarget.cells).forEach(c=>c.style.background="")}>
            {row.map((cell,ci)=>{
              let color="var(--t1)";
              if(cell===null||cell===undefined) color="var(--t3)";
              else if(isBool(cell)) color="var(--purple)";
              else if(isDate(String(cell))) color="var(--yellow)";
              else if(isNum(cell)) color="var(--blue)";
              return <td key={ci} style={{ padding:"5px 14px",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",whiteSpace:"nowrap",color,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis" }}>{cell===null||cell===undefined?"NULL":String(cell)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children, footer }) {
  if(!open) return null;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(4px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div className="fade-in" style={{ background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:10,width:500,maxWidth:"95vw",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.6)" }}>
        <div style={{ padding:"20px 24px 0",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span style={{ fontSize:15,fontWeight:600 }}>{title}</span>
          <button className="icon-btn" onClick={onClose}>{ICONS.close}</button>
        </div>
        <div style={{ padding:"20px 24px" }}>{children}</div>
        {footer&&<div style={{ padding:"0 24px 20px",display:"flex",justifyContent:"flex-end",gap:8 }}>{footer}</div>}
      </div>
    </div>
  );
}

function Btn({ children, variant="ghost", onClick, disabled, style={} }) {
  const base = { display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:"var(--r)",fontSize:12.5,fontWeight:500,border:"1px solid transparent",transition:"all .15s",opacity:disabled?.4:1,cursor:disabled?"not-allowed":"pointer" };
  const variants = {
    primary:{ background:"var(--accent)",color:"var(--bg0)",borderColor:"var(--accent)" },
    ghost:{ background:"none",color:"var(--t1)",borderColor:"var(--border)" },
    danger:{ background:"none",color:"var(--red)",borderColor:"var(--border)" },
  };
  return <button style={{...base,...variants[variant],...style}} onClick={!disabled?onClick:undefined}>{children}</button>;
}

function FormRow({ label, hint, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block",fontSize:11.5,color:"var(--t2)",marginBottom:5,fontWeight:500 }}>{label}</label>
      {children}
      {hint&&<div style={{ fontSize:11,color:"var(--t3)",marginTop:4 }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type="text", style={} }) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type} style={{ width:"100%",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--r)",color:"var(--t0)",padding:"7px 10px",fontSize:13,outline:"none",...style }} onFocus={e=>e.target.style.borderColor="var(--accent)"} onBlur={e=>e.target.style.borderColor="var(--border)"}/>;
}

function Select({ value, onChange, children, style={} }) {
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{ width:"100%",background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--r)",color:"var(--t0)",padding:"7px 10px",fontSize:13,outline:"none",...style }}>{children}</select>;
}

// ─── CONNECTION MODAL ─────────────────────────────────────────────────────────

function ConnectionModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ name:"",type:"postgresql",host:"localhost",port:"5432",database:"",user:"",password:"",ssl:"prefer",specialValue:"",token:"",warehouse:"",connStr:"" });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  useEffect(()=>{ if(form.type&&DB_PORTS[form.type]) set("port",DB_PORTS[form.type]); },[form.type]);

  const isSpecial = SPECIAL_TYPES.has(form.type);
  const specialConfig = {
    snowflake:{label:"Account Identifier",ph:"orgname-accountname",hint:"e.g. myorg-myaccount or account.region.cloud",showWarehouse:true,showToken:false},
    databricks:{label:"Server Hostname",ph:"adb-xxxx.azuredatabricks.net",hint:"HTTP Path: /sql/1.0/warehouses/...",showWarehouse:true,showToken:true},
    bigquery:{label:"Project ID",ph:"my-gcp-project",hint:"Your Google Cloud Project ID",showWarehouse:false,showToken:true},
    duckdb:{label:"Database File Path",ph:":memory: or /path/to/file.duckdb",hint:"Use :memory: for in-memory",showWarehouse:false,showToken:false},
    sqlite:{label:"Database File Path",ph:"/path/to/database.sqlite",hint:"Absolute or relative path",showWarehouse:false,showToken:false},
  }[form.type]||{};

  const save = () => {
    if(!form.name.trim()){ alert("Enter a connection name"); return; }
    const conn = { id:"c"+Date.now(), ...form, connected:false, databases:generateMockDatabases(form.type,form) };
    onSave(conn); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New Connection"
      footer={<>
        <Btn onClick={()=>{ /* test */ }}>Test Connection</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save}>{ICONS.save} Save</Btn>
      </>}
    >
      <FormRow label="Connection Name"><Input value={form.name} onChange={v=>set("name",v)} placeholder="My Database"/></FormRow>
      <FormRow label="Database Type">
        <Select value={form.type} onChange={v=>set("type",v)}>
          {DB_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </Select>
      </FormRow>
      {!isSpecial ? <>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
          <FormRow label="Host"><Input value={form.host} onChange={v=>set("host",v)} placeholder="localhost"/></FormRow>
          <FormRow label="Port"><Input value={form.port} onChange={v=>set("port",v)} placeholder="5432"/></FormRow>
        </div>
        <FormRow label="Database"><Input value={form.database} onChange={v=>set("database",v)} placeholder="postgres"/></FormRow>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14 }}>
          <FormRow label="Username"><Input value={form.user} onChange={v=>set("user",v)} placeholder="postgres"/></FormRow>
          <FormRow label="Password"><Input value={form.password} onChange={v=>set("password",v)} type="password" placeholder="••••••"/></FormRow>
        </div>
        <FormRow label="SSL Mode">
          <Select value={form.ssl} onChange={v=>set("ssl",v)}>
            {["prefer","require","disable","verify-full"].map(s=><option key={s} value={s}>{s}</option>)}
          </Select>
        </FormRow>
      </> : <>
        <FormRow label={specialConfig.label} hint={specialConfig.hint}><Input value={form.specialValue} onChange={v=>set("specialValue",v)} placeholder={specialConfig.ph}/></FormRow>
        {specialConfig.showToken&&<FormRow label="Access Token / API Key"><Input value={form.token} onChange={v=>set("token",v)} type="password" placeholder="Token"/></FormRow>}
        {specialConfig.showWarehouse&&<FormRow label="Warehouse / HTTP Path"><Input value={form.warehouse} onChange={v=>set("warehouse",v)} placeholder="COMPUTE_WH"/></FormRow>}
      </>}
      <FormRow label="Connection String (optional override)" hint="Overrides individual fields above if provided">
        <Input value={form.connStr} onChange={v=>set("connStr",v)} placeholder="postgresql://user:pass@host:5432/db"/>
      </FormRow>
    </Modal>
  );
}

// ─── EXPLORER PANEL ──────────────────────────────────────────────────────────

function ExplorerPanel({ connections, onNewConn, onDeleteConn, onTableAction }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",overflow:"hidden" }}>
      <div style={{ height:44,padding:"0 12px",display:"flex",alignItems:"center",borderBottom:"1px solid var(--border)",flexShrink:0,gap:8 }}>
        <span style={{ flex:1,fontSize:10.5,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:"var(--t2)" }}>Explorer</span>
        <button className="icon-btn" style={{width:24,height:24}} onClick={onNewConn} title="New Connection">{ICONS.plus}</button>
        <button className="icon-btn" style={{width:24,height:24}} title="Refresh">{ICONS.refresh}</button>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"6px 0" }}>
        {!connections.length
          ? <div style={{ padding:16,fontSize:12,color:"var(--t3)",textAlign:"center",lineHeight:1.6 }}>No connections yet.<br/>Click + to add one.</div>
          : connections.map(conn=><ConnItem key={conn.id} conn={conn} onDelete={()=>onDeleteConn(conn.id)} onTableAction={onTableAction}/>)
        }
      </div>
    </div>
  );
}

function ConnItem({ conn, onDelete, onTableAction }) {
  const [open, setOpen] = useState(false);
  const [colors] = useState(()=>{ const [bg,bd]=(DB_BADGE_COLOR[conn.type]||"#1a1a2a:#71717a").split(":"); return {bg,bd}; });
  const badge = DB_BADGE[conn.type]||"DB";

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",padding:"5px 10px 5px 8px",gap:5,cursor:"pointer",userSelect:"none",background:open?"rgba(110,231,183,.05)":"" }}
        onClick={()=>setOpen(o=>!o)}
        onMouseEnter={e=>{ if(!open) e.currentTarget.style.background="var(--bg3)"; }}
        onMouseLeave={e=>{ if(!open) e.currentTarget.style.background=""; }}
      >
        {ICONS.chevron(open)}
        <div style={{ width:7,height:7,borderRadius:"50%",background:open?"var(--accent)":"var(--t3)",boxShadow:open?"0 0 5px var(--accent)40":"none",flexShrink:0,transition:"all .2s" }}/>
        <span style={{ flex:1,fontSize:12.5,fontWeight:500,color:"var(--t1)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{conn.name}</span>
        <span style={{ fontSize:9.5,padding:"1px 5px",borderRadius:3,fontFamily:"var(--mono)",fontWeight:600,background:colors.bg,color:colors.bd }}>{badge}</span>
        <button className="icon-btn" style={{width:20,height:20,opacity:0,transition:"opacity .1s"}} onClick={e=>{e.stopPropagation();onDelete();}}
          onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0"}
          title="Remove">{ICONS.trash}</button>
      </div>
      {open && (conn.databases||[]).map(db=>(
        <DbItem key={db.name} db={db} connId={conn.id} indent={1} onTableAction={onTableAction}/>
      ))}
    </div>
  );
}

// hack: static map since we can't reference DB_BADGE_COLOR before it's defined
const DB_BADGE_COLOR = {
  postgresql:"#1d3a6e:#60a5fa", mysql:"#1a3a2a:#4ade80", duckdb:"#2d1f3d:#c084fc",
  snowflake:"#0f2d4a:#38bdf8", databricks:"#2a1a0e:#fb923c", sqlite:"#1a2a3a:#94a3b8",
  bigquery:"#0a2a1a:#34d399", mssql:"#1a1a3a:#818cf8", clickhouse:"#3a1a0a:#fbbf24"
};

function DbItem({ db, connId, indent, onTableAction }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <TreeNode icon={ICONS.db()} label={db.name} indent={indent} onClick={()=>setOpen(o=>!o)}>
        {db.schemas ? db.schemas.map(s=><SchemaItem key={s.name} schema={s} connId={connId} dbName={db.name} indent={indent+1} onTableAction={onTableAction}/>) :
          <ObjectGroup label="Tables" items={db.tables||[]} icon={ICONS.table()} connId={connId} dbName={db.name} indent={indent+1} onTableAction={onTableAction}/>
        }
        {!db.schemas && db.views?.length>0 && <ObjectGroup label="Views" items={db.views} icon={ICONS.view()} connId={connId} dbName={db.name} indent={indent+1} onTableAction={onTableAction}/>}
      </TreeNode>
    </div>
  );
}

function SchemaItem({ schema, connId, dbName, indent, onTableAction }) {
  const total = (schema.tables?.length||0)+(schema.views?.length||0);
  return (
    <TreeNode icon={ICONS.schema()} label={schema.name} labelColor="var(--t1)" badge={total} indent={indent}>
      {schema.tables?.length>0 && <ObjectGroup label="Tables" items={schema.tables} icon={ICONS.table()} connId={connId} dbName={dbName} indent={indent+1} onTableAction={onTableAction}/>}
      {schema.views?.length>0 && <ObjectGroup label="Views" items={schema.views} icon={ICONS.view()} connId={connId} dbName={dbName} indent={indent+1} onTableAction={onTableAction}/>}
      {schema.procedures?.length>0 && <ObjectGroup label="Stored Procedures" items={schema.procedures} icon={ICONS.sp()} connId={connId} dbName={dbName} indent={indent+1} onTableAction={onTableAction}/>}
      {schema.functions?.length>0 && <ObjectGroup label="Functions" items={schema.functions} icon={ICONS.fn()} connId={connId} dbName={dbName} indent={indent+1} onTableAction={onTableAction}/>}
    </TreeNode>
  );
}

function ObjectGroup({ label, items, icon, connId, dbName, indent, onTableAction }) {
  if(!items?.length) return null;
  return (
    <div>
      <div style={{ padding:`6px 10px 3px ${indent*14+8}px`,fontSize:10,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:"var(--t3)" }}>{label}</div>
      {items.map(obj=>(
        <TreeNode key={obj.name} icon={icon} label={obj.name} badge={obj.cols?.length||""} indent={indent}
          onCtx={e=>{ e.preventDefault(); onTableAction("ctx",{connId,dbName,name:obj.name,e}); }}
          onClick={()=>onTableAction("click",{connId,dbName,name:obj.name})}
        >
          {(obj.cols||[]).map(c=>(
            <div key={c.n} style={{ display:"flex",alignItems:"center",gap:5,padding:`3px 10px 3px ${(indent+1)*14+8}px` }}>
              {c.pk?ICONS.pk:c.fk?ICONS.fk:ICONS.col}
              <span style={{ flex:1,fontSize:11.5,color:"var(--t1)" }}>{c.n}</span>
              <span style={{ fontSize:10,color:"var(--purple)",fontFamily:"var(--mono)" }}>{c.t}</span>
            </div>
          ))}
        </TreeNode>
      ))}
    </div>
  );
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

function Toasts({ toasts }) {
  const icons = { success:"✓", error:"✕", info:"i" };
  const colors = { success:"var(--accent)", error:"var(--red)", info:"var(--blue)" };
  return (
    <div style={{ position:"fixed",bottom:30,right:16,zIndex:2000,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none" }}>
      {toasts.map(t=>(
        <div key={t.id} className="toast" style={{ background:"var(--bg3)",border:`1px solid var(--border2)`,borderLeft:`3px solid ${colors[t.type]}`,borderRadius:"var(--r)",padding:"10px 14px",fontSize:12.5,display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 24px rgba(0,0,0,.4)",maxWidth:320 }}>
          <span style={{ color:colors[t.type],fontWeight:600,fontSize:13 }}>{icons[t.type]}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

let tabId = 2;

export default function App() {
  const [connections, setConnections] = useState(()=>JSON.parse(localStorage.getItem("sqlstudio_conns")||"[]"));
  const [savedQueries, setSavedQueries] = useState(()=>JSON.parse(localStorage.getItem("sqlstudio_saved")||"[]"));
  const [tabs, setTabs] = useState([{ id:"t1", name:"Query 1", sql:"-- Welcome to SQL Studio\n-- Connect a database, then run queries here\n\nSELECT 1 + 1 AS result;", connId:null, dbName:null, unsaved:false }]);
  const [activeTab, setActiveTab] = useState("t1");
  const [activity, setActivity] = useState("explorer");
  const [showConnModal, setShowConnModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState(""); const [saveDesc, setSaveDesc] = useState("");
  const [toasts, setToasts] = useState([]);
  const [queryRunning, setQueryRunning] = useState(false);
  const [results, setResults] = useState(null); // { columns, rows } | null
  const [resultError, setResultError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [lineageGraph, setLineageGraph] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState("results");
  const [lineageFlash, setLineageFlash] = useState(false);
  const [resultInfo, setResultInfo] = useState("");
  const [resizeH, setResizeH] = useState(260);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const editorContainerRef = useRef(null);
  const resizingRef = useRef(false);
  const splitRef = useRef(null);

  // Persist connections
  useEffect(()=>{ localStorage.setItem("sqlstudio_conns",JSON.stringify(connections)); },[connections]);
  useEffect(()=>{ localStorage.setItem("sqlstudio_saved",JSON.stringify(savedQueries)); },[savedQueries]);

  // Toast helper
  const toast = useCallback((msg,type="info")=>{
    const id = Date.now();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3000);
  },[]);

  const addMessage = useCallback((msg,type)=>{
    const ts = new Date().toLocaleTimeString();
    setMessages(m=>[...m,{msg,type,ts,id:Date.now()}]);
  },[]);

  // Monaco init
  useEffect(()=>{
    if(!editorContainerRef.current||monacoRef.current) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js";
    script.onload = () => {
      window.require.config({ paths:{ vs:"https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs" }});
      window.require(["vs/editor/editor.main"],()=>{
        if(monacoRef.current) return;
        const monaco = window.monaco;
        monaco.editor.defineTheme("sql-dark",{
          base:"vs-dark", inherit:true,
          rules:[{token:"keyword.sql",foreground:"6ee7b7",fontStyle:"bold"},{token:"string.sql",foreground:"fbbf24"},{token:"number.sql",foreground:"60a5fa"},{token:"comment.sql",foreground:"52525b",fontStyle:"italic"}],
          colors:{"editor.background":"#0a0a0b","editor.foreground":"#fafafa","editorLineNumber.foreground":"#3f3f48","editorLineNumber.activeForeground":"#71717a","editor.lineHighlightBackground":"#18181b","editor.selectionBackground":"#6ee7b730","editorCursor.foreground":"#6ee7b7","editorGutter.background":"#0a0a0b","scrollbarSlider.background":"#27272c","editorWidget.background":"#18181b","editorWidget.border":"#2e2e35"}
        });
        const editor = monaco.editor.create(editorContainerRef.current,{
          value: tabs.find(t=>t.id===activeTab)?.sql||"",
          language:"sql", theme:"sql-dark",
          fontFamily:"'Berkeley Mono','Fira Code',monospace", fontSize:13.5, lineHeight:22,
          minimap:{enabled:false}, overviewRulerLanes:0, scrollBeyondLastLine:false,
          renderLineHighlight:"line", cursorBlinking:"smooth", cursorSmoothCaretAnimation:"on",
          smoothScrolling:true, wordWrap:"off", folding:true, lineNumbers:"on", glyphMargin:false,
          padding:{top:12,bottom:12}, scrollbar:{verticalScrollbarSize:8,horizontalScrollbarSize:8},
          suggest:{showKeywords:true}, quickSuggestions:{other:true,comments:false,strings:false},
        });
        monacoRef.current = monaco;
        editorRef.current = editor;
        editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter, ()=>runQueryRef.current());
        editor.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS, ()=>setShowSaveModal(true));
        editor.onDidChangeModelContent(()=>{
          const val = editor.getValue();
          setTabs(ts=>ts.map(t=>t.id===activeTabRef.current?{...t,sql:val,unsaved:true}:t));
        });
      });
    };
    document.head.appendChild(script);
    return ()=>{ if(editorRef.current){ editorRef.current.dispose(); editorRef.current=null; monacoRef.current=null; }};
  },[]);

  // Refs for stable callbacks
  const activeTabRef = useRef(activeTab);
  useEffect(()=>{ activeTabRef.current=activeTab; },[activeTab]);
  const connectionsRef = useRef(connections);
  useEffect(()=>{ connectionsRef.current=connections; },[connections]);

  // Sync editor when tab changes
  useEffect(()=>{
    if(!editorRef.current) return;
    const tab = tabs.find(t=>t.id===activeTab);
    if(tab && editorRef.current.getValue()!==tab.sql) editorRef.current.setValue(tab.sql||"");
  },[activeTab]);

  // Resize observer for Monaco
  useEffect(()=>{
    if(!editorContainerRef.current) return;
    const ro = new ResizeObserver(()=>{ editorRef.current?.layout(); });
    ro.observe(editorContainerRef.current);
    return ()=>ro.disconnect();
  },[]);

  // Get current tab
  const curTab = tabs.find(t=>t.id===activeTab);

  // ── Query execution ──
  const runQueryRef = useRef(null);
  const runQuery = useCallback(async()=>{
    if(queryRunning) return;
    const editor = editorRef.current, monaco = monacoRef.current;
    if(!editor) return;

    // Get active statement at cursor
    let sql = "";
    const sel = editor.getSelection();
    const selText = editor.getModel().getValueInRange(sel).trim();
    if(selText) {
      sql = selText;
    } else {
      const fullText = editor.getModel().getValue();
      const pos = editor.getPosition();
      const offset = editor.getModel().getOffsetAt(pos);
      const stmts = []; let start=0;
      for(let i=0;i<=fullText.length;i++){
        if(i===fullText.length||fullText[i]===";"){
          const s=fullText.slice(start,i).trim(); if(s) stmts.push({text:s,start,end:i});
          start=i+1;
        }
      }
      sql = stmts.find(s=>offset>=s.start&&offset<=s.end+1)?.text || stmts[stmts.length-1]?.text || fullText.trim();
    }
    sql = sql.replace(/;+$/,"").trim();
    if(!sql){ toast("No query to run","info"); return; }

    const connId = curTab?.connId;
    if(!connId){ toast("Please select a connection first","error"); return; }

    setQueryRunning(true);
    setResults(null);
    setResultError(null);
    setActiveResultTab("results");

    const t0 = Date.now();
    await new Promise(r=>setTimeout(r,300+Math.random()*600));
    const elapsed = Date.now()-t0;
    const result = simulateQuery(sql);
    setQueryRunning(false);

    if(result.error){
      setResultError(result.error);
      addMessage(`Error: ${result.error}`,"error");
      toast(result.error,"error");
      setResultInfo("");
    } else {
      setResults(result);
      setResultError(null);
      const info = `${result.rows.length} row${result.rows.length!==1?"s":""} · ${elapsed}ms`;
      setResultInfo(info);
      addMessage(`Query OK — ${result.rows.length} rows in ${elapsed}ms`,"success");
      toast(`${result.rows.length} rows in ${elapsed}ms`,"success");
      // Lineage
      const lg = parseLineage(sql,connId,connectionsRef.current);
      setLineageGraph(lg);
      if(lg?.nodes.length){ setLineageFlash(true); setTimeout(()=>setLineageFlash(false),1500); }
    }
  },[queryRunning,curTab,toast,addMessage]);

  useEffect(()=>{ runQueryRef.current=runQuery; },[runQuery]);

  // ── Tabs ──
  const addTab = useCallback((name,sql,connId)=>{
    const id="t"+(tabId++);
    setTabs(ts=>[...ts,{id,name:name||`Query ${tabId-1}`,sql:sql||"",connId:connId||null,dbName:null,unsaved:false}]);
    setActiveTab(id);
    setTimeout(()=>{ if(editorRef.current) editorRef.current.setValue(sql||""); },50);
  },[]);

  const closeTab = useCallback((id,e)=>{
    e?.stopPropagation();
    setTabs(ts=>{
      if(ts.length===1) return [{...ts[0],sql:"",unsaved:false}];
      const idx=ts.findIndex(t=>t.id===id), next=ts.filter(t=>t.id!==id);
      if(id===activeTab) setActiveTab(next[Math.max(0,idx-1)].id);
      return next;
    });
  },[activeTab]);

  const switchTab = useCallback((id)=>{
    setActiveTab(id);
    const tab = tabs.find(t=>t.id===id);
    if(tab && editorRef.current && editorRef.current.getValue()!==tab.sql) editorRef.current.setValue(tab.sql||"");
  },[tabs]);

  // ── Resize handle ──
  useEffect(()=>{
    const onMove = e=>{ if(!resizingRef.current||!splitRef.current) return; const rect=splitRef.current.getBoundingClientRect(); const newH=Math.max(80,Math.min(rect.height-100,rect.bottom-e.clientY)); setResizeH(newH); editorRef.current?.layout(); };
    const onUp = ()=>{ resizingRef.current=false; };
    document.addEventListener("mousemove",onMove); document.addEventListener("mouseup",onUp);
    return ()=>{ document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); };
  },[]);

  // ── Table actions from explorer ──
  const handleTableAction = useCallback((action,{connId,dbName,name})=>{
    if(action==="click"||action==="ctx"){
      const sql = `SELECT * FROM ${dbName?dbName+".":""}${name}\nLIMIT 100;`;
      if(editorRef.current) editorRef.current.setValue(sql);
      setTabs(ts=>ts.map(t=>t.id===activeTabRef.current?{...t,sql,connId,dbName,unsaved:true}:t));
    }
  },[]);

  // ── Save query ──
  const doSave = ()=>{
    if(!saveName.trim()){ toast("Enter a query name","error"); return; }
    const sql = editorRef.current?.getValue()||"";
    setSavedQueries(q=>[...q,{id:"q"+Date.now(),name:saveName.trim(),desc:saveDesc,sql,ts:new Date().toISOString()}]);
    setShowSaveModal(false); setSaveName(""); setSaveDesc("");
    setTabs(ts=>ts.map(t=>t.id===activeTab?{...t,unsaved:false}:t));
    toast(`Saved "${saveName}"`, "success");
  };

  const loadSaved = (q)=>{
    addTab(q.name, q.sql);
    toast(`Loaded "${q.name}"`,"info");
  };

  const exportCSV = ()=>{
    if(!results){ toast("No results to export","error"); return; }
    const csv = [results.columns.join(","), ...results.rows.map(r=>r.map(v=>`"${v??""}`).join(","))].join("\n");
    const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv); a.download="results_"+Date.now()+".csv"; a.click();
    toast("Exported CSV","success");
  };

  const formatSQL = ()=>{
    if(!editorRef.current) return;
    const sql=editorRef.current.getValue();
    const kws=["SELECT","FROM","WHERE","GROUP BY","HAVING","ORDER BY","LIMIT","OFFSET","LEFT JOIN","RIGHT JOIN","INNER JOIN","JOIN","ON","AND","OR","WITH","UNION","INSERT INTO","VALUES","UPDATE","SET","DELETE FROM"];
    let f=sql; kws.forEach(k=>{ f=f.replace(new RegExp(`\\b${k}\\b`,"gi"),"\n"+k); });
    f=f.replace(/,\s*/g,",\n  ").trim();
    editorRef.current.setValue(f);
    toast("Formatted","info");
  };

  // ── Active tab connector selects ──
  const connSelectValue = curTab?.connId||"";
  const dbSelectValue = curTab?.dbName||"";
  const activeConn = connections.find(c=>c.id===connSelectValue);

  const setTabConnId = (connId)=>{ setTabs(ts=>ts.map(t=>t.id===activeTab?{...t,connId,dbName:null}:t)); };
  const setTabDbName = (dbName)=>{ setTabs(ts=>ts.map(t=>t.id===activeTab?{...t,dbName}:t)); };

  return (
    <div style={{ display:"flex", flexDirection:"column", width:"100vw", height:"100vh", overflow:"hidden", background:"var(--bg0)", color:"var(--t0)", fontFamily:"var(--font)", fontSize:13 }}>
      <style>{css}</style>
      <style>{`html,body,#root{width:100%;height:100%;margin:0;padding:0;overflow:hidden;background:#0a0a0b;}`}</style>
      {/* TITLEBAR */}
      <div style={{ height:40,background:"var(--bg1)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 14px",gap:12,flexShrink:0,userSelect:"none" }}>
        <div style={{ display:"flex",alignItems:"center",gap:7,fontWeight:600,fontSize:13.5,letterSpacing:"-.3px" }}>
          <div style={{ width:22,height:22,background:"var(--accent)",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <svg viewBox="0 0 16 16" fill="none" width={13} height={13}><path d="M2 4h12M2 8h8M2 12h10" stroke="#0a0a0b" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          SQL <span style={{color:"var(--accent)"}}>Studio</span>
        </div>
        <div style={{flex:1}}/>
        <button className="icon-btn" onClick={()=>setShowSaveModal(true)} title="Save Query (⌘S)">{ICONS.save}</button>
        <button className="icon-btn" onClick={exportCSV} title="Export CSV">{ICONS.download}</button>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>
        {/* ACTIVITY BAR */}
        <div style={{ width:44,background:"var(--bg1)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 0",gap:2,flexShrink:0 }}>
          {[["explorer",ICONS.grid],["saved",ICONS.bookmarks]].map(([name,icon])=>(
            <button key={name} onClick={()=>setActivity(name)}
              style={{ width:36,height:36,background:"none",border:"none",borderRadius:"var(--r)",color:activity===name?"var(--t0)":"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",position:"relative",background:activity===name?"var(--bg4)":"none",transition:"all .15s" }}
              onMouseEnter={e=>{ if(activity!==name) e.currentTarget.style.color="var(--t1)"; }}
              onMouseLeave={e=>{ if(activity!==name) e.currentTarget.style.color="var(--t3)"; }}
            >
              {activity===name&&<div style={{ position:"absolute",left:-1,top:"50%",transform:"translateY(-50%)",width:2,height:18,background:"var(--accent)",borderRadius:"0 2px 2px 0" }}/>}
              {icon}
            </button>
          ))}
          <div style={{flex:1}}/>
          <button className="icon-btn" style={{width:36,height:36}} onClick={()=>setShowConnModal(true)} title="New Connection">{ICONS.plus}</button>
        </div>

        {/* SIDEBAR */}
        <div style={{ width:260,background:"var(--bg1)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0 }}>
          {activity==="explorer"
            ? <ExplorerPanel connections={connections} onNewConn={()=>setShowConnModal(true)} onDeleteConn={id=>setConnections(c=>c.filter(x=>x.id!==id))} onTableAction={handleTableAction}/>
            : <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
                <div style={{ height:44,padding:"0 12px",display:"flex",alignItems:"center",borderBottom:"1px solid var(--border)",flexShrink:0 }}>
                  <span style={{ fontSize:10.5,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:"var(--t2)" }}>Saved Queries</span>
                </div>
                <div style={{ flex:1,overflowY:"auto" }}>
                  {!savedQueries.length
                    ? <div style={{ padding:16,fontSize:12,color:"var(--t3)",textAlign:"center",lineHeight:1.6 }}>No saved queries.<br/>Press ⌘S to save.</div>
                    : savedQueries.map(q=>(
                        <div key={q.id} onClick={()=>loadSaved(q)} style={{ padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid var(--border)" }}
                          onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                          <div style={{ fontSize:12.5,color:"var(--t1)",fontWeight:500 }}>{q.name}</div>
                          <div style={{ fontSize:11,color:"var(--t3)",fontFamily:"var(--mono)",marginTop:2 }}>{q.desc||""} · {q.ts.split("T")[0]}</div>
                        </div>
                      ))
                  }
                </div>
              </div>
          }
        </div>

        {/* MAIN */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0 }}>
          {/* TABS */}
          <div style={{ height:36,background:"var(--bg1)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"flex-end",overflowX:"auto",overflowY:"hidden",padding:"0 4px",flexShrink:0 }}>
            {tabs.map(tab=>(
              <div key={tab.id} onClick={()=>switchTab(tab.id)}
                style={{ display:"flex",alignItems:"center",gap:6,padding:"0 10px",height:30,background:tab.id===activeTab?"var(--bg0)":"var(--bg2)",border:"1px solid",borderColor:tab.id===activeTab?"var(--border2)":"var(--border)",borderBottom:tab.id===activeTab?"var(--bg0)":"none",borderRadius:"5px 5px 0 0",cursor:"pointer",whiteSpace:"nowrap",color:tab.id===activeTab?"var(--t0)":"var(--t2)",fontSize:12,marginRight:2,flexShrink:0,position:"relative",transition:"all .1s" }}
              >
                {tab.id===activeTab&&<div style={{ position:"absolute",top:-1,left:0,right:0,height:2,background:"var(--accent)",borderRadius:"2px 2px 0 0" }}/>}
                <svg viewBox="0 0 16 16" fill="none" width={12} height={12}><path d="M2 4h12M2 7h8M2 10h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span>{tab.name}</span>
                {tab.unsaved&&<div style={{ width:7,height:7,borderRadius:"50%",background:"var(--yellow)",flexShrink:0 }}/>}
                <button onClick={e=>closeTab(tab.id,e)} style={{ width:16,height:16,background:"none",border:"none",color:"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:3,marginLeft:2,padding:0 }}
                  onMouseEnter={e=>{ e.currentTarget.style.background="var(--bg4)"; e.currentTarget.style.color="var(--t0)"; }} onMouseLeave={e=>{ e.currentTarget.style.background=""; e.currentTarget.style.color="var(--t3)"; }}
                >{ICONS.close}</button>
              </div>
            ))}
            <button onClick={()=>addTab()} style={{ width:28,height:28,background:"none",border:"none",color:"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"var(--r)",margin:"auto 0 3px 2px",cursor:"pointer",flexShrink:0 }}
              onMouseEnter={e=>{ e.currentTarget.style.background="var(--bg3)"; e.currentTarget.style.color="var(--t1)"; }} onMouseLeave={e=>{ e.currentTarget.style.background=""; e.currentTarget.style.color="var(--t3)"; }}
            >{ICONS.plus}</button>
          </div>

          {/* TOOLBAR */}
          <div style={{ height:44,background:"var(--bg1)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0,position:"relative",overflow:"hidden" }}>
            {queryRunning&&<div style={{ position:"absolute",top:0,left:0,height:2,background:"var(--accent)",animation:"progress 1.5s ease infinite",width:"60%" }}/>}
            <select value={connSelectValue} onChange={e=>setTabConnId(e.target.value)}
              style={{ background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--r)",color:"var(--t1)",padding:"4px 8px",fontSize:12,outline:"none",minWidth:150,cursor:"pointer" }}>
              <option value="">— Select connection —</option>
              {connections.map(c=><option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
            <select value={dbSelectValue} onChange={e=>setTabDbName(e.target.value)}
              style={{ background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--r)",color:"var(--t1)",padding:"4px 8px",fontSize:12,outline:"none",minWidth:110,cursor:"pointer" }}>
              <option value="">— Database —</option>
              {(activeConn?.databases||[]).map(db=><option key={db.name} value={db.name}>{db.name}</option>)}
            </select>
            <div style={{ width:1,height:20,background:"var(--border)",margin:"0 2px" }}/>
            <button onClick={runQuery} disabled={queryRunning}
              style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 14px",background:"var(--accent)",color:"var(--bg0)",border:"none",borderRadius:"var(--r)",fontSize:12,fontWeight:600,cursor:queryRunning?"not-allowed":"pointer",opacity:queryRunning?.6:1,transition:"all .15s",whiteSpace:"nowrap" }}
            >
              {queryRunning?<div className="spinner"/>:ICONS.play}
              {queryRunning?"Running…":"Run"}
            </button>
            <span style={{ background:"var(--bg4)",border:"1px solid var(--border2)",borderRadius:3,padding:"1px 5px",fontFamily:"var(--mono)",fontSize:10,color:"var(--t2)" }}>⌘↵</span>
            <div style={{flex:1}}/>
            <button className="icon-btn" onClick={formatSQL} title="Format SQL">{ICONS.format}</button>
            <button className="icon-btn" onClick={()=>{ editorRef.current?.setValue(""); }} title="Clear">{ICONS.close}</button>
          </div>

          {/* SPLIT */}
          <div ref={splitRef} style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0 }}>
            {/* EDITOR */}
            <div style={{ flex:1,overflow:"hidden",minHeight:80 }}>
              <div ref={editorContainerRef} style={{ width:"100%",height:"100%" }}/>
            </div>

            {/* RESIZE HANDLE */}
            <div onMouseDown={()=>{ resizingRef.current=true; }}
              style={{ height:5,background:"var(--border)",cursor:"row-resize",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.background="var(--border)"}
            >
              <div style={{ width:30,height:2,borderRadius:1,background:"currentColor",opacity:.3 }}/>
            </div>

            {/* RESULTS PANE */}
            <div style={{ height:resizeH,display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--bg0)",borderTop:"1px solid var(--border)" }}>
              {/* Results toolbar */}
              <div style={{ height:32,background:"var(--bg1)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 12px",gap:8,flexShrink:0 }}>
                {[["results","Results"],["messages","Messages"],["lineage","Lineage",true]].map(([id,label,hasIcon])=>(
                  <button key={id} onClick={()=>setActiveResultTab(id)}
                    style={{ padding:"0 8px",height:26,background:activeResultTab===id?"var(--bg3)":"none",border:"none",color:activeResultTab===id?"var(--t0)":lineageFlash&&id==="lineage"?"var(--accent)":"var(--t2)",fontSize:11.5,cursor:"pointer",borderRadius:"var(--r)",transition:"all .1s",display:"flex",alignItems:"center",gap:4 }}
                    onMouseEnter={e=>{ if(activeResultTab!==id) e.currentTarget.style.color="var(--t1)"; }} onMouseLeave={e=>{ if(activeResultTab!==id) e.currentTarget.style.color=lineageFlash&&id==="lineage"?"var(--accent)":"var(--t2)"; }}
                  >
                    {hasIcon&&ICONS.lineage}{label}
                  </button>
                ))}
                <div style={{ marginLeft:"auto",fontSize:11,color:"var(--t2)",fontFamily:"var(--mono)" }}>{resultInfo}</div>
              </div>

              {/* Results content */}
              <div style={{ flex:1,overflow:"auto",position:"relative" }}>
                {/* Results tab */}
                {activeResultTab==="results"&&(
                  queryRunning
                    ? <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"var(--t2)" }}><div className="spinner"/><span style={{fontSize:12}}>Executing query…</span></div>
                    : resultError
                      ? <div style={{ padding:20,fontFamily:"var(--mono)",fontSize:12.5 }}><div style={{ marginBottom:6,fontWeight:"bold",color:"var(--t0)" }}>Query Error</div><div style={{ color:"var(--red)" }}>{resultError}</div></div>
                      : results
                        ? <div className="fade-in"><ResultsTable columns={results.columns} rows={results.rows}/></div>
                        : <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:10,color:"var(--t3)" }}>
                            <svg viewBox="0 0 24 24" fill="none" width={32} height={32} style={{opacity:.4}}><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            <p style={{fontSize:12}}>Run a query to see results</p>
                          </div>
                )}

                {/* Messages tab */}
                {activeResultTab==="messages"&&(
                  <div style={{ padding:"12px 16px",fontFamily:"var(--mono)",fontSize:12,color:"var(--t1)",height:"100%",overflowY:"auto" }}>
                    {!messages.length
                      ? <div style={{ color:"var(--t3)" }}>No messages yet.</div>
                      : messages.map(m=>(
                          <div key={m.id} style={{ marginBottom:6 }}>
                            <span style={{ color:"var(--t3)" }}>[{m.ts}]</span>{" "}
                            <span style={{ color:m.type==="error"?"var(--red)":m.type==="success"?"var(--accent)":"var(--t1)" }}>{m.msg}</span>
                          </div>
                        ))
                    }
                  </div>
                )}

                {/* Lineage tab */}
                {activeResultTab==="lineage"&&(
                  <div style={{ height:"100%",overflow:"hidden" }}>
                    <LineageCanvas graph={lineageGraph}/>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={{ height:24,background:"var(--bg1)",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 12px",gap:12,flexShrink:0,fontFamily:"var(--mono)",fontSize:11,color:"var(--t2)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:4 }}>
          <div style={{ width:5,height:5,borderRadius:"50%",background:queryRunning?"var(--yellow)":resultError?"var(--red)":"var(--accent)" }}/>
          <span>{queryRunning?"Running…":resultError?"Error":"Ready"}</span>
        </div>
        <div style={{flex:1}}/>
        <span>{resultInfo}</span>
        <span>SQL Studio v2.0</span>
      </div>

      {/* MODALS */}
      <ConnectionModal open={showConnModal} onClose={()=>setShowConnModal(false)} onSave={conn=>{ setConnections(c=>[...c,conn]); toast(`Connection "${conn.name}" saved`,"success"); }}/>

      <Modal open={showSaveModal} onClose={()=>setShowSaveModal(false)} title="Save Query"
        footer={<><Btn onClick={()=>setShowSaveModal(false)}>Cancel</Btn><Btn variant="primary" onClick={doSave}>Save</Btn></>}
      >
        <FormRow label="Query Name"><Input value={saveName} onChange={setSaveName} placeholder="My Query"/></FormRow>
        <FormRow label="Description (optional)"><Input value={saveDesc} onChange={setSaveDesc} placeholder="What does this query do?"/></FormRow>
      </Modal>

      <Toasts toasts={toasts}/>

      <style>{`
        @keyframes progress { 0%{width:0%;left:0} 50%{width:60%;left:20%} 100%{width:0%;left:100%} }
      `}</style>
    </div>
  );
}