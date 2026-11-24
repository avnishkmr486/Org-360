import type { Employee, EmploymentStatus } from "@/types";
import { designationId } from "./master-data";

/** Seed job titles by department and band (BAND-1…BAND-4); band 5+ are directors. */
const TITLES: Record<string, [string, string, string, string]> = {
  "DEP-01": ["Associate Business Analyst", "Business Analyst", "Product Manager", "Sr. Product Manager"],
  "DEP-02": ["Associate Software Engineer", "Software Engineer", "Technical Lead", "Principal Developer"],
  "DEP-03": ["QA Engineer", "QA Analyst", "QA Lead", "Principal QA Engineer"],
  "DEP-04": ["PS Trainee", "Business Consultant", "Sr. Business Analyst", "Principal Business Analyst"],
  "DEP-05": ["Client Support Executive", "Client Support Executive", "Technical Manager", "Technical Manager"],
  "DEP-06": ["Network Engineer", "Server Administrator", "Sr. System Administrator", "Site Reliability Engineer"],
  "DEP-07": ["Admin Executive", "Lead Accountant", "Business Analyst", "Director"],
  "DEP-08": ["HR Intern", "Admin Executive", "HR Manager", "HR Manager"],
};
const titleFor = (dept: string, band: string) => {
  const level = Number(band.replace(/\D/g, "")) || 1;
  if (level >= 5) return designationId("Director");
  const t = TITLES[dept] ?? ["Software Developer", "Software Engineer", "Development Lead", "Development Manager"];
  return designationId(t[Math.min(level, 4) - 1]);
};

type Row = [
  num: number,
  first: string,
  last: string,
  dept: string,
  team: string | null,
  band: string,
  manager: number | null,
  joined: string,
  status?: EmploymentStatus,
];

/*
 * Reporting structure:
 *   COO (EMP-1043) ← all department heads
 *   Department head ← team supervisors and project managers
 *   Team supervisor ← team members
 */
const rows: Row[] = [
  // DEP-01 Product Management
  [1001, "Ananya", "Sharma", "DEP-01", null, "BAND-5", 1043, "2016-06-13"],
  [1002, "Rahul", "Verma", "DEP-01", "TEAM-01", "BAND-3", 1001, "2018-02-05"],
  [1003, "Sneha", "Gupta", "DEP-01", "TEAM-01", "BAND-2", 1002, "2021-08-16"],
  [1004, "Aditya", "Rao", "DEP-01", "TEAM-01", "BAND-2", 1002, "2022-01-10"],
  [1005, "Pooja", "Singh", "DEP-01", "TEAM-01", "BAND-2", 1002, "2022-07-04"],
  // DEP-02 Engineering
  [1006, "Vikram", "Malhotra", "DEP-02", null, "BAND-5", 1043, "2014-03-03"],
  [1007, "Karan", "Bhatia", "DEP-02", "TEAM-02", "BAND-3", 1006, "2017-09-18"],
  [1008, "Neha", "Agarwal", "DEP-02", "TEAM-02", "BAND-2", 1007, "2019-11-11"],
  [1009, "Amit", "Kumar", "DEP-02", "TEAM-02", "BAND-1", 1007, "2023-01-09"],
  [1010, "Ritu", "Chauhan", "DEP-02", "TEAM-02", "BAND-1", 1007, "2024-02-12"],
  [1011, "Siddharth", "Jain", "DEP-02", "TEAM-02", "BAND-2", 1007, "2020-05-25"],
  [1012, "Deepak", "Yadav", "DEP-02", "TEAM-03", "BAND-3", 1006, "2016-12-05"],
  [1013, "Shruti", "Pandey", "DEP-02", "TEAM-03", "BAND-2", 1012, "2020-10-19"],
  [1014, "Manish", "Tiwari", "DEP-02", "TEAM-03", "BAND-1", 1012, "2022-06-20"],
  [1015, "Nikhil", "Bansal", "DEP-02", "TEAM-03", "BAND-1", 1012, "2024-07-01"],
  [1016, "Ishita", "Saxena", "DEP-02", "TEAM-03", "BAND-1", 1012, "2023-04-17"],
  [1017, "Harsh", "Vardhan", "DEP-02", "TEAM-03", "BAND-4", 1006, "2018-08-27"],
  // DEP-03 Quality Assurance
  [1018, "Priya", "Nair", "DEP-03", null, "BAND-5", 1043, "2015-07-20"],
  [1019, "Gaurav", "Mishra", "DEP-03", "TEAM-04", "BAND-3", 1018, "2018-03-12"],
  [1020, "Swati", "Kulkarni", "DEP-03", "TEAM-04", "BAND-2", 1019, "2020-09-07"],
  [1021, "Rajat", "Arora", "DEP-03", "TEAM-04", "BAND-1", 1019, "2023-03-06"],
  [1022, "Divya", "Menon", "DEP-03", "TEAM-04", "BAND-1", 1019, "2023-10-23"],
  [1023, "Tarun", "Sethi", "DEP-03", "TEAM-04", "BAND-2", 1019, "2021-02-15"],
  // DEP-04 Implementation
  [1024, "Rohit", "Kapoor", "DEP-04", null, "BAND-5", 1043, "2015-01-19"],
  [1025, "Anjali", "Desai", "DEP-04", "TEAM-05", "BAND-4", 1024, "2017-05-08"],
  [1026, "Varun", "Khanna", "DEP-04", "TEAM-05", "BAND-3", 1024, "2018-11-26"],
  [1027, "Nidhi", "Bhatt", "DEP-04", "TEAM-05", "BAND-2", 1026, "2021-06-14"],
  [1028, "Akash", "Pillai", "DEP-04", "TEAM-05", "BAND-1", 1026, "2024-01-22"],
  [1029, "Suresh", "Babu", "DEP-04", "TEAM-06", "BAND-3", 1024, "2017-10-02"],
  [1030, "Ayesha", "Khan", "DEP-04", "TEAM-06", "BAND-2", 1029, "2020-12-07"],
  [1031, "Mohit", "Goel", "DEP-04", "TEAM-06", "BAND-1", 1029, "2023-08-21"],
  [1032, "Lavanya", "Krishnan", "DEP-04", "TEAM-06", "BAND-2", 1029, "2021-04-12"],
  // DEP-05 Customer Support
  [1033, "Meera", "Iyer", "DEP-05", null, "BAND-5", 1043, "2016-02-22"],
  [1034, "Rakesh", "Sinha", "DEP-05", "TEAM-07", "BAND-3", 1033, "2018-07-16"],
  [1035, "Pallavi", "Das", "DEP-05", "TEAM-07", "BAND-2", 1034, "2020-01-27"],
  [1036, "Imran", "Sheikh", "DEP-05", "TEAM-07", "BAND-1", 1034, "2022-09-05"],
  [1037, "Tanvi", "Shah", "DEP-05", "TEAM-07", "BAND-1", 1034, "2023-11-13"],
  [1038, "Yash", "Thakur", "DEP-05", "TEAM-07", "BAND-1", 1034, "2024-03-18", "on_leave"],
  // DEP-06 DevOps & Infrastructure
  [1039, "Arjun", "Reddy", "DEP-06", null, "BAND-5", 1043, "2015-09-14"],
  [1040, "Naveen", "Kumar", "DEP-06", "TEAM-08", "BAND-3", 1039, "2018-01-08"],
  [1041, "Sonal", "Mathur", "DEP-06", "TEAM-08", "BAND-2", 1040, "2020-06-29"],
  [1042, "Kunal", "Dutta", "DEP-06", "TEAM-08", "BAND-1", 1040, "2023-05-15"],
  // DEP-07 Business Operations
  [1043, "Sanjay", "Mehta", "DEP-07", null, "BAND-5", null, "2012-04-02"],
  [1044, "Ritika", "Bose", "DEP-07", "TEAM-09", "BAND-3", 1043, "2017-03-20"],
  [1045, "Abhishek", "Chawla", "DEP-07", "TEAM-09", "BAND-2", 1044, "2020-08-10"],
  [1046, "Simran", "Kaur", "DEP-07", "TEAM-09", "BAND-1", 1044, "2023-06-26"],
  // DEP-08 Administration & HR
  [1047, "Kavita", "Joshi", "DEP-08", null, "BAND-5", 1043, "2014-11-10"],
  [1048, "Farhan", "Ali", "DEP-08", "TEAM-10", "BAND-3", 1047, "2019-02-18"],
  [1049, "Megha", "Rastogi", "DEP-08", "TEAM-10", "BAND-2", 1048, "2021-09-13"],
  [1050, "Vivek", "Dubey", "DEP-08", "TEAM-10", "BAND-1", 1048, "2023-01-30", "inactive"],
];

const CREATED = "2024-05-01T09:00:00.000Z";

export const employeesSeed: Employee[] = rows.map(
  ([num, first, last, dept, team, band, manager, joined, status = "active"]) => ({
    id: `EMP-${num}`,
    firstName: first,
    lastName: last,
    email: `${first}.${last}`.toLowerCase() + "@altametrics.example",
    phone: `+91 98${String(num * 7919).padStart(8, "0").slice(-8)}`,
    bandId: band,
    designationId: titleFor(dept, band),
    departmentId: dept,
    teamId: team,
    reportingManagerId: manager ? `EMP-${manager}` : null,
    dateOfJoining: joined,
    status,
    createdAt: CREATED,
    updatedAt: CREATED,
  }),
);
