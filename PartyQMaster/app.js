/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var mongojs = require('mongojs');

var db = mongojs('mongodb://admin:admin@ds157653.mlab.com:57653/partyq-users');
var client_id = '00e493dfeeb14ff98a17caeacc82c244'; // Your client id
var client_secret = 'af87e6b4f2b142a9bee7f2c6761dbca0'; // Your secret
var redirect_uri_current = 'http://localhost:8888/callback'; // Your redirect uri
var redirect_uri_search_user = 'http://localhost:8888/search';

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', function(req, res) {
  // db.users.find(function(err, users){
  //   if(err) {
  //     res.redirect("http://localhost:8888");
  //   }
  //   console.log(users);
  // });
  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private playlist-read-private user-read-currently-playing';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri_current,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter
  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;
  var user = '';

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri_current,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var roomNumber = generateRandomString(6);
        // console.log(roomNumber);

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          user = body;
          // db.users.save({
          //   "client_id": user.id,
          //   "roomNumber": roomNumber,
          //   "playlist_id": "",
          //   "access_token": access_token
          // });

          // creating a PartyQ playlist in the hosts spotify account
          // playlistCall = {
          //   url: 'https://api.spotify.com/v1/users/' + user.id + '/playlists',
          //   headers: { 
          //     'Accept': 'application/json',
          //     // Content-Type: 'application/json',
          //     'Authorization': 'Bearer ' + access_token
          //   },
          //   data: JSON.stringify({
          //     'description': 'Playlist Created by PartyQ Application',
          //     'public': false,
          //     'name': 'PartyQ'
          //   })
          // };

          // console.log(playlistCall);

          // request.post(playlistCall, function(error, response, body) {
          //   if(!error && response.statusCode === 200) {
          //     console.log(body);
          //   } else {
          //     console.log(error);
          //     console.log(body);
          //   }
          // });

        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' + querystring.stringify({ access_token: access_token, roomNumber: roomNumber}));
      } else {
        res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
      }
    });
  }
});

app.get('/getPlaylistId', function(req, res) {

  // requesting access token from refresh token
  var access_token = req.query.access_token;
  var roomNumber_ = req.query.roomNumber;

  var options = {
    url: 'https://api.spotify.com/v1/me/playlists?limit=1',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };

  request.get(options, function(error, response, body) {
    // console.log(roomNumber_);
    db.users.update(
      {"roomNumber" : roomNumber_},
      {$set : {"playlist_id" : body.items[0].id}
    });
    res.send(body.items[0].id);
  });
});

app.get('/searchMusic', function(req, res) {

  var access_token = req.query.access_token;
  var searchValue = req.query.searchValue;

  var options = {
    url: 'https://api.spotify.com/v1/search?q=' + searchValue + '&type=track&limit=20',
    headers: { 'Authorization': 'Bearer ' + access_token},
    json: true
  };

  request.get(options, function(error, response, body) {
    // console.log(body.tracks.items);
    res.send(body.tracks.items);
  });
});

app.get('/refresh', function (req, res) {

  var access_token = req.query.access_token;
  var client_id = req.query.client_id;
  var playlist_id = req.query.playlist_id;

  var options = {
    url: 'https://api.spotify.com/v1/users/' + client_id + '/playlists/' + playlist_id + '/tracks',
    headers: { 'Authorization': 'Bearer ' + access_token},
    json: true
  };

  request.get(options, function(error, response, body) {
    res.send(body.items);
  });
});

app.get('/getCurrentSong', function(req, res) {

  var access_token = req.query.access_token;

  var options = {
    url: 'https://api.spotify.com/v1/me/player/currently-playing',
    headers: { 'Authorization': 'Bearer ' + access_token},
    json: true
  };

  request.get(options, function(error, response, body) {
    res.send(body);
  });
})

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);




















