const fs = require("fs");
const xml2js = require("xml2js");
const { execSync } = require("child_process");

const junitFilePath = process.argv[2];
const alias = process.argv[3];

if (!junitFilePath) {
  console.log("Please provide the path to the JUnit XML file as an argument.");
  process.exit(1);
}

let htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Apex Test Report</title>
      <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.1/css/all.min.css">
      <style>
        body {
          font-family: Arial, sans-serif;
        }
        .failed {
          background-color: #f88;
        }
        .sortable:after {
          content: "\\f0dc";
          font-family: "Font Awesome 5 Free";
          font-weight: 900;
          margin-left: 5px;
        }
        .table-responsive {
          max-height: 80vh;
          overflow-y: auto;
        }
        .float-right {
          float: right;
        }
        #myChart {
          width: 200px;
          height: 200px;
          margin: 0 auto;
        }
        .info-card {
          padding: 10px;
          background-color: #f2f2f2;
          border-radius: 5px;
          margin: 10px 0;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script>
      function sortTable(n) {
        var table, rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
        table = document.getElementById("myTable");
        switching = true;
        dir = "asc";
        while (switching) {
          switching = false;
          rows = table.rows;
          for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            x = rows[i].getElementsByTagName("TD")[n];
            y = rows[i + 1].getElementsByTagName("TD")[n];
            if (dir == "asc") {
              if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
                shouldSwitch = true;
                break;
              }
            } else if (dir == "desc") {
              if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
                shouldSwitch = true;
                break;
              }
            }
          }
          if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchcount ++;
          } else {
            if (switchcount == 0 && dir == "asc") {
              dir = "desc";
              switching = true;
            }
          }
        }
      }

      function exportTableToCSV(filename) {
        var csv = [];
        var rows = document.getElementById("myTable").querySelectorAll("table tr");
        
        for (var i = 0; i < rows.length; i++) {
            var row = [], cols = rows[i].querySelectorAll("td, th");
            
            for (var j = 0; j < cols.length; j++) 
                row.push(cols[j].innerText);
            
            csv.push(row.join(","));        
        }
        var csvFile = new Blob([csv.join("\\n")], {type: "text/csv"});
        var downloadLink = document.createElement("a");
        downloadLink.download = filename;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();
      }
      </script>
    </head>
    <body>
      <div class="container-fluid">
        <h1 class="mt-3">Apex Test Report</h1>
        <div class="info-card">
        <h3>Report Date: ${new Date().toLocaleDateString()} <span style="margin-left: 20px;">Environment Name: ${alias}</span></h3>
        </div>
        <button onclick="exportTableToCSV('testReport.csv')" class="btn btn-primary float-right">Export to CSV</button>
        <div id="chart-container">
          <canvas id="myChart"></canvas>
        </div>
        <div class="table-responsive">
          <table class="table table-striped table-bordered" id="myTable">
            <thead>
              <tr>
                <th onclick="sortTable(0)" class="sortable">Name</th>
                <th onclick="sortTable(1)" class="sortable">Class Name</th>
                <th onclick="sortTable(2)" class="sortable">Time</th>
                <th onclick="sortTable(3)" class="sortable">Status</th>
                <th onclick="sortTable(4)" class="sortable">Failure Message</th>
              </tr>
            </thead>
            <tbody>`;

fs.readFile(junitFilePath, (err, data) => {
  if (err) throw err;

  xml2js.parseString(data, (err, result) => {
    if (err) throw err;

    const testCases = result.testsuites.testsuite[0].testcase;
    const properties = result.testsuites.testsuite[0].properties[0].property;

    let totalTestTime;

    properties.forEach((property) => {
      if (property.$.name === "testTotalTime") {
        totalTestTime = parseFloat(property.$.value.slice(0, -2));
      }
    });

    let passedTestCases = 0;
    let failedTestCases = 0;

    testCases.forEach((testCase) => {
      const name = testCase.$.name;
      const className = testCase.$.classname;
      const time = parseFloat(testCase.$.time);
      const status = testCase.failure ? "Failed" : "Passed";
      const failureMessage = testCase.failure ? testCase.failure[0]._ : "";

      if (status === "Passed") {
        passedTestCases++;
      } else {
        failedTestCases++;
      }

      htmlContent += `
        <tr${status === "Failed" ? ' class="failed"' : ""}>
          <td>${name}</td>
          <td>${className}</td>
          <td>${time}</td>
          <td>${status}</td>
          <td>${failureMessage}</td>
        </tr>`;
    });

    console.log("Total Test Cases: " + testCases.length);
    console.log("Passed Test Cases: " + passedTestCases);
    console.log("Failed Test Cases: " + failedTestCases);

    let command = `sfp metrics:report -m 'testrun.passed' -t 'gauge' -v '${passedTestCases}'  -g '{\"env\":\"${alias}\"}'`;
    let output = execSync(command, { encoding: "utf8" });

    command = `sfp metrics:report -m 'testrun.executed' -t 'gauge' -v '${testCases.length}' -g '{\"env\":\"${alias}\"}'`;
    output = execSync(command, { encoding: "utf8" });

    command = `sfp metrics:report -m 'testrun.failed' -t 'gauge' -v '${failedTestCases}'  -g '{\"env\":\"${alias}\"}'`;
    output = execSync(command, { encoding: "utf8" });

    htmlContent += `
    </tbody>
  </table>
</div>
</div>
</body>
<script>
var ctx = document.getElementById('myChart').getContext('2d');
var myChart = new Chart(ctx, {
type: 'pie',
data: {
  labels: ['Passed', 'Failed'],
  datasets: [{
    data: [${passedTestCases}, ${failedTestCases}],
    backgroundColor: [
      'rgb(75, 192, 192)',
      'rgb(255, 99, 132)'
    ]
  }]
},
options: {
  responsive: false
}
});
</script>
</html>`;

    fs.writeFileSync(
      `testresults/${alias.toLocaleLowerCase()}.html`,
      htmlContent,
    );
  });
});
