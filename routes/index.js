const fs = require("fs");
const ini = require("ini");
const zipcodes = require("zipcodes");
const mssql = require("mssql");
const express = require('express');

const config = ini.parse(fs.readFileSync("./config.ini", "utf-8"))

var gmaps = require('@google/maps').createClient({
    key: config.google.GEOCODE_API_KEY
});

const router = express.Router();

var mssqlConfig = {
    user: config.database.USER,
    password: config.database.PASS,
    server: config.database.SERVER,
    database: config.database.DB,

    options: {
	encrypt: true
    }
}

console.log(mssqlConfig);

router.get("/programs", (req, res) => {
    // gets programs from database accoridng to query params
 
    gmaps.geocode({
	address: req.query.address
    }, function(err, response) {
	if (!err) {
	    let resp = response.json.results;
	    let lat = resp[0].geometry.location.lat;
	    let lon = resp[0].geometry.location.lng;
	    let query = `
	    DECLARE @g geography = geography::Point(${lat}, ${lon}, 4326);

	    WITH ZipCodeData AS (
		SELECT zc.ZipCodeID ,
		zc.GeoLocation ,
		@g.STDistance(zc.GeoLocation) AS Dist,
		(@g.STDistance(zc.GeoLocation) / 1609.344) AS Miles
		FROM dbo.ZipCode zc
	    )

	    SELECT TOP ${req.query.limit} fc.ProgramName, fc.ContactName, fc.LocationDescription, fc.StreetName, fc.City, fc.ZipCode, fc.Hours, zcd.Miles
	    FROM ZipCodeData zcd
	    INNER JOIN dbo.ServiceArea sa ON sa.ZipCode = zcd.ZipCodeID
	    INNER JOIN dbo.FoodCenter fc ON fc.FoodCenterID = sa.FoodCenterID
	    WHERE fc.IsActive = 1 AND zcd.Miles <= ${req.query.radius}
	    ORDER BY zcd.Dist`

	    mssql.connect(mssqlConfig)
		.then(() => new mssql.Request().query(query))
		.then(recordset => res.send({
		    action_success : true,
		    data : {
			results : recordset
		    }
		}))
		.catch(err => res.send({
		    action_success : false,
		    error : err
		}));
	} else {
	    res.send({
		action_success : false,
		error : err
	    });
	}
    });
});
        
module.exports = router;
