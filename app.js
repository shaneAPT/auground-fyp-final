// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// [START gae_node_request_example]
const express = require('express');
const mysql = require('mysql');
const multer = require('multer');

const app = express();

console.log("user: "+ process.env.SQL_USER);

var config = {
    user: process.env.SQL_USER,
    database: process.env.SQL_DATABASE,
    password: process.env.SQL_PASSWORD,
    host: '34.89.96.130',
    port: '3306'
}

var dbMethods = require('./dbCon')();

if (process.env.INSTANCE_CONNECTION_NAME && process.env.NODE_ENV === 'production') {
    config.socketPath = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
} 

var connection = mysql.createConnection(config);

connection.connect();

app.use(express.static(__dirname + '/public'));
app.set('views', __dirname + '/public');
app.set('view engine', 'ejs');
app.use(multer({ inMemory: true }));

app.get('/', async (req, res) => {
	//console.log("test: " + getAllFilters());

    connection.query(
        'SHOW databases', function(err, result, fields){
            if (err) throw err;
            console.log(result);
        }
    );

    // dbMethods.queryDatabase('SELECT * FROM filters', null, function(err, filters) {
    //     if (err) return next(err);
    //     res.render('index', {filterResults: filters});
    // });

    console.log("req query " + req.query.filterID);

    if(req.query.filterID != null) {
        var passedVariable = req.query.filterID;
        dbMethods.queryDatabase('SELECT *, Date_Format(filters.dateCreated,\'%d/%m/%Y\') As dateC, (Select Date_Format(filters.dateUpdated,\'%d/%m/%Y\')) As dateU FROM filters WHERE filterID = ' + passedVariable, null, function(err, dbFilters) {
            if (err) throw err;
            console.log("DB filter query " + dbFilters);
            dbMethods.queryDatabase('SELECT * FROM filterContent WHERE filterID = ' + passedVariable, null, function(err, dbFilterContent) {
                if (err) throw err;
                console.log("DB filter content query " + dbFilterContent);
                res.render('filt', {filterDetails: dbFilters, filterContent: dbFilterContent});
            });
        });
    } else {
        dbMethods.queryDatabase('SELECT *, Date_Format(filters.dateCreated,\'%d/%m/%Y\') As dateC, (Select Date_Format(filters.dateUpdated,\'%d/%m/%Y\')) As dateU FROM filters', null, function(err, dbAllFilters) {
            if (err) throw err;
            res.render('index', {allFilters: dbAllFilters});
        });
    }


    //console.log("ST: Rendering index.ejs with " + allFilters);
	// res.render('index', {filterResults: allFilters});
});

app.get('/filter', async (req, res) => {
     res.redirect('/');
});

/* Add a new case */
app.post('/filter', function(req, res, next) {
    res.redirect('/?filterID=' + req.body.filterButton);
});

app.use(express.static(__dirname + '/public'));

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
		console.log(`App listening on port ${PORT}`);
		console.log('Press Ctrl+C to quit.');
});
// [END gae_node_request_example]


module.exports = app;
