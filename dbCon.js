const express = require('express');
const mysql = require('mysql');
var url = require('url');

module.exports = function() {
  const app = express();

  console.log("user: "+ process.env.SQL_USER);

  var config = {
      user: process.env.SQL_USER,
      database: process.env.SQL_DATABASE,
      password: process.env.SQL_PASSWORD,
      host: '34.89.96.130',
      port: '3306'
  }

  if (process.env.INSTANCE_CONNECTION_NAME && process.env.NODE_ENV === 'production') {
      config.socketPath = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
  } 

  var connection = mysql.createConnection(config);

  connection.connect();

  app.use(express.static(__dirname + '/public'));
  app.set('views', __dirname + '/public');
  app.set('view engine', 'ejs');

  function queryDatabase(query, value, callback) {
    connection.query(query, (err, filters) => callback(err, filters));                                                   
  }


  return {
    queryDatabase: queryDatabase
  };
};