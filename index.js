/*
Instagram users may export their data in an archive https://help.instagram.com/181231772500920. This script imports the data and photos from an Instagram export and import it to a Ghost blog using the Ghost private API. 
*/

const path = require('path');
const fs = require('fs');
const request = require('request');
const queryString = require('query-string');

const auth = {
  username: 'user@name.com', 
  password: 'paassword',
  client_id: 'ghost-admin', 
  client_secret: '000000000' 
}

const settings = {
  blog_url: 'http://localhost:2368', // ghost blog URL
  instagram_dir: './instagram/', // instagram backup base dir
  instagram_data_file: './instagram/media.json' // instagram media.json file
  log_errors: null // set to true to see errors in console
}

const options = {
  tag_id: null, // set custom tag eg. '5c4741605b294600015a2283'
  custom_template: null, // set a custom template eg. 'custom-template'
  add_location_to_post: true, // set to true to add location and map link to post content
  set_caption_as_title: true // set to true to set caption as post title
}

let auth_token = null; // do not edit

// read instagram export data file
async function readDataFile(file) {
  return new Promise(resolve => {
    fs.readFile(file, 'utf8', (err, res) => {
      if (err) throw err;
      const photos = JSON.parse(res);
      resolve(photos.photos);
    });
  });
}

// console out errors
async function logError(errors) {
  if(settings.log_errors) {
    console.log("\n");
    console.log("#################### ERROR ####################");
    console.log("\n");
    console.log(errors);
    console.log("\n");
  }
}

// get authorization token from ghost server
async function getAuthToken(username, password, client_id, client_secret) {
  return new Promise(resolve => {
    const request_data = {
      url: settings.blog_url + '/ghost/api/v0.1/authentication/token', 
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
      }, 
      body: queryString.stringify(
        {
          'grant_type': 'password',
          'username': auth.username,
          'password': auth.password,
          'client_id': auth.client_id,
          'client_secret': auth.client_secret
        }
      )      
    }
    request.post(request_data, function(err, res) {
      // console.log("###### getAuthKey ########################################");
      const response = JSON.parse(res.body);
      const errors = response.errors;
      if(errors) {
        logError(errors);
      }
      resolve(response.access_token) // return access_token
    });
  });
}

// post images
async function postImage(instagram_object) {
  return new Promise(resolve => {  
    const request_data = { 
      url: settings.blog_url + '/ghost/api/v0.1/uploads', 
      headers: { 
        'Content-Type': 'image/jpg', 
        'Authorization': 'Bearer ' + auth_token 
      }, 
      formData: { 
        uploadimage: fs.createReadStream(settings.instagram_dir + instagram_object.path) 
      } 
    }
    request.post(request_data, function(err, res) {
      // console.log("###### postImage ########################################");
      const response = JSON.parse(res.body);
      const errors = response.errors;
      if(errors) {
        logError(errors);
      }
      resolve(response);
    });
  });
}

// post posts
async function postPost(image, instagram_object) {
  return new Promise(resolve => {
    let mobiledoc = null;
    let title = '';
    // set caption as title
    if(options.set_caption_as_title) {
      if(instagram_object.caption) {
        title = (instagram_object.caption) ? instagram_object.caption : '';
      }
    }
    // add location and map link to post contnet
    if(options.add_location_to_post) {
      if(instagram_object.location) {
        const uri = encodeURI("https://www.openstreetmap.org/search?query=" + instagram_object.location);
        mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[],\"markups\":[[\"a\",[\"href\",\"" + uri + "\"]]],\"sections\":[[1,\"p\",[[0,[],0,\"📍\"],[0,[0],1,\"" + instagram_object.location + "\"]]]]}"
      }
    }
    const request_data = {
      url: settings.blog_url + '/ghost/api/v0.1/posts',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + auth_token 
      },
      body: JSON.stringify(
        {
          "posts": [
            {
              "feature_image": image,
              "custom_template": options.custom_template,
              "page": false,
              "slug": instagram_object.path.replace(/^.*[\\\/]/, '').replace('.jpg', ''), // set image name as slug
              "status": "published",
              "title": title,
              "mobiledoc": mobiledoc,
              "published_at": instagram_object.taken_at,
              "updated_at": instagram_object.taken_at,
              "created_at": instagram_object.taken_at,
              "tags": (options.tag_id) ? [ { "id": options.tag_id } ] : null
            }
          ]
        } 
      )
    }
    request.post(request_data, function(err, res) {
      // console.log("###### postPost ########################################");
      const response = JSON.parse(res.body);
      const errors = response.errors;
      if(errors) {
        logError(errors);
      }
      console.log(response)      
      resolve(response);
    });
  });
}

(async () => {
  // get token from Ghost Token API
  auth_token = await getAuthToken(auth.username, auth.password, auth.client_id, auth.client_secret);
  // read instagram export data file
  const instagram_objects = await readDataFile(settings.instagram_data_file);
  instagram_objects.forEach(async (instagram_object) => {
    // push images to server
    const image = await postImage(instagram_object);
    // create blog posts
    await postPost(image, instagram_object)
  });
})();
