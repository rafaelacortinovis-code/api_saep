const express = require("express");
const cors = require("cors");

const app = express();


app.use(cors());
app.use(express.json());

const db = require('./db');

app.get('/produtos', (req, res) => {


db.query(
    'SELECT * FROM produtos',
    (erro, resultado) => {

        if(erro){
            return res.status(500).json(erro);
        }

        res.json(resultado);
    }
);


});


module.exports = app;